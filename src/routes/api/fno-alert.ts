import { createFileRoute } from "@tanstack/react-router";

/**
 * F&O alert test dispatcher.
 *
 * Generates AI option trades from the live chain and pushes them to Telegram
 * as boxed F&O alert cards with an "F&O Alerts" button. Educational only.
 */

const ALLOWED: Record<string, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  NIFTY50: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  SENSEX: "BSE_INDEX|SENSEX",
};

export const Route = createFileRoute("/api/fno-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { symbol?: string };
          const raw = String(body.symbol ?? "NIFTY").toUpperCase().replace(/[\s_-]/g, "");
          const instrumentKey = ALLOWED[raw];
          if (!instrumentKey) {
            return Response.json(
              { ok: false, error: "symbol must be NIFTY, BANKNIFTY or SENSEX" },
              { status: 400 },
            );
          }
          const label = raw === "NIFTY50" ? "NIFTY" : raw;

          const { generatePremiumTrades, sendFnoAlerts } = await import("@/lib/ai-trades.server");
          const { buildMockChain, buildMockPlan } = await import("@/lib/mock-chain.server");

          // Test alerts must always work: try live Upstox data, otherwise fall
          // back to a randomised simulated chain (no credentials required).
          let chain;
          let expiry = "";
          let simulated = false;
          try {
            const { getAccessToken, fetchExpiries, fetchOptionChain } = await import(
              "@/lib/upstox.server"
            );
            const token = getAccessToken();
            const expiries = await fetchExpiries(instrumentKey, token);
            expiry = expiries[0] ?? "";
            if (!expiry) throw new Error("No expiry available");
            chain = await fetchOptionChain(instrumentKey, expiry, token);
          } catch (liveErr) {
            console.warn("[fno-alert] live chain unavailable, using test data:", (liveErr as Error).message);
            chain = buildMockChain(label);
            expiry = chain.expiry;
            simulated = true;
          }

          let plan;
          try {
            plan = await generatePremiumTrades(label, chain);
            if (!plan.trades.length) throw new Error("AI returned no trades");
          } catch (aiErr) {
            console.warn("[fno-alert] AI unavailable, using sample trades:", (aiErr as Error).message);
            plan = buildMockPlan(label, chain);
            simulated = true;
          }

          const notified = await sendFnoAlerts(plan);

          console.log(
            `[fno-alert] ${label} ${expiry} simulated=${simulated} cards=${notified.cards} sent=${notified.sent}/${notified.total}`,
          );
          return Response.json(
            { ok: true, symbol: label, expiry, simulated, trades: plan.trades.length, notified },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          const msg = (e as Error).message || "Unknown error";
          console.error("[fno-alert]", msg);
          return Response.json(
            { ok: false, error: msg },
            { headers: { "cache-control": "no-store" } },
          );
        }

      },
    },
  },
});
