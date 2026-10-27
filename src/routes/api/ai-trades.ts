import { createFileRoute } from "@tanstack/react-router";
import { readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";

/**
 * AI premium trades from the live Upstox option chain, optionally pushed to
 * Telegram. Secrets stay server-side. Triggers paid Gemini calls and Telegram
 * sends, so it requires CRON_SECRET (x-cron-secret or Authorization: Bearer) or an admin session.
 */
export const Route = createFileRoute("/api/ai-trades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;

        const { getAccessToken, fetchOptionChain, MissingEnvError, UpstoxAuthError } =
          await import("@/lib/upstox.server");
        const { generatePremiumTrades, sendPremiumTrades } = await import("@/lib/ai-trades.server");
        try {
          const body = await readJsonBody<{
            instrument_key: string;
            symbol: string;
            expiry: string;
            notify: boolean;
          }>(request);
          if (
            typeof body.instrument_key !== "string" ||
            typeof body.expiry !== "string" ||
            !body.instrument_key ||
            !body.expiry ||
            body.instrument_key.length > 100 ||
            body.expiry.length > 30
          ) {
            return Response.json(
              {
                ok: false,
                sent: 0,
                skipped: 0,
                errors: ["instrument_key and expiry are required"],
                error: "instrument_key and expiry are required",
              },
              { status: 400 },
            );
          }
          const symbol =
            typeof body.symbol === "string" && body.symbol
              ? body.symbol.slice(0, 40)
              : body.instrument_key;
          const chain = await fetchOptionChain(body.instrument_key, body.expiry, getAccessToken());
          const plan = await generatePremiumTrades(symbol, chain);
          let notified: { sent: number; total: number } | null = null;
          // A+ ideas are always pushed to Telegram automatically.
          const aplus = plan.trades.filter((t) => t.grade === "A+");
          if (body.notify) notified = await sendPremiumTrades(plan);
          else if (aplus.length) notified = await sendPremiumTrades({ ...plan, trades: aplus });
          console.log(
            `[ai-trades] ${plan.symbol} ${plan.expiry} trades=${plan.trades.length} notified=${notified?.sent ?? 0}`,
          );
          return Response.json(
            { ok: true, sent: notified?.sent ?? 0, skipped: 0, errors: [], plan, notified },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[ai-trades]", err.message);
          return Response.json(
            {
              ok: false,
              sent: 0,
              skipped: 0,
              errors: [err.message],
              error: err.message,
              tokenExpired,
              missing,
            },
            { status: tokenExpired ? 401 : 500, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
