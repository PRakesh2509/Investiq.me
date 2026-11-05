import { createFileRoute } from "@tanstack/react-router";
import { hookFailure, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { parseChatIds } from "@/lib/telegram.server";

/**
 * F&O alert dispatcher (manual & test trigger).
 *
 * Pulls live derivatives data from DhanHQ v2, generates Grade A+ sniper trades,
 * and pushes them directly to Telegram using the boxed card layout with
 * the F&O Alerts button.
 * Requires CRON_SECRET or Admin Session.
 */

const ALLOWED = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY"];

export const Route = createFileRoute("/api/fno-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const body = await readJsonBody<{ symbol?: string; chatIds?: string[] }>(request);
          const raw = String(body?.symbol ?? "NIFTY")
            .toUpperCase()
            .replace(/[\s_-]/g, "");
          const label =
            raw === "NIFTY50" ? "NIFTY" : raw === "BANK" ? "BANKNIFTY" : raw;

          if (!ALLOWED.includes(label)) {
            return hookFailure(`symbol must be one of: ${ALLOWED.join(", ")}`, 400);
          }

          const { getLiveDerivativesChain, generatePremiumTrades, sendFnoAlerts } =
            await import("@/lib/ai-trades.server");

          const chain = await getLiveDerivativesChain(label);
          const expiry = chain.expiry;
          const plan = await generatePremiumTrades(label, chain);
          if (!plan.trades.length) {
            return hookFailure(`No A+ trade setups identified for ${label} at this moment.`, 404);
          }

          const chatIds = parseChatIds(body?.chatIds);
          const notified = await sendFnoAlerts(
            plan,
            chatIds.length ? chatIds : undefined,
            1,
          );

          console.log(
            `[fno-alert] ${label} ${expiry} trades=${plan.trades.length} sent=${notified.sent}/${notified.total}`,
          );
          return Response.json(
            {
              ok: notified.sent > 0,
              sent: notified.sent,
              total: notified.total,
              symbol: label,
              expiry,
              trades: plan.trades.length,
              notified,
              feedSource: "DhanHQ Live Direct Feed v2",
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          const msg = (e as Error).message || "Unknown error";
          console.error("[fno-alert]", msg);
          return hookFailure(msg);
        }
      },
    },
  },
});
