import { createFileRoute } from "@tanstack/react-router";

/**
 * AI premium trades from the live Upstox option chain, optionally pushed to
 * Telegram. Secrets stay server-side; the browser only sends the instrument.
 */
export const Route = createFileRoute("/api/ai-trades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAccessToken, fetchOptionChain, MissingEnvError, UpstoxAuthError } =
          await import("@/lib/upstox.server");
        const { generatePremiumTrades, sendPremiumTrades } = await import("@/lib/ai-trades.server");
        try {
          const body = (await request.json().catch(() => ({}))) as {
            instrument_key?: string;
            symbol?: string;
            expiry?: string;
            notify?: boolean;
          };
          if (!body.instrument_key || !body.expiry) {
            return Response.json(
              { ok: false, error: "instrument_key and expiry are required" },
              { status: 400 },
            );
          }
          const chain = await fetchOptionChain(body.instrument_key, body.expiry, getAccessToken());
          const plan = await generatePremiumTrades(body.symbol || body.instrument_key, chain);
          let notified: { sent: number; total: number } | null = null;
          // A+ ideas are always pushed to Telegram automatically.
          const aplus = plan.trades.filter((t) => t.grade === "A+");
          if (body.notify) notified = await sendPremiumTrades(plan);
          else if (aplus.length) notified = await sendPremiumTrades({ ...plan, trades: aplus });
          console.log(
            `[ai-trades] ${plan.symbol} ${plan.expiry} trades=${plan.trades.length} notified=${notified?.sent ?? 0}`,
          );
          return Response.json(
            { ok: true, plan, notified },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[ai-trades]", err.message);
          return Response.json(
            { ok: false, error: err.message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
