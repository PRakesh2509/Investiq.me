import { createFileRoute } from "@tanstack/react-router";
import { hookFailure, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { parseChatIds } from "@/lib/telegram.server";

/**
 * F&O alert test dispatcher.
 *
 * Generates AI option trades from the live chain and pushes them to Telegram
 * as boxed F&O alert cards with an "F&O Alerts" button. Educational only.
 * Requires CRON_SECRET (x-cron-secret or Authorization: Bearer).
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
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const body = await readJsonBody<{ symbol: string; chatIds: string[] }>(request);
          const raw = String(body.symbol ?? "NIFTY")
            .toUpperCase()
            .replace(/[\s_-]/g, "");
          const instrumentKey = ALLOWED[raw];
          if (!instrumentKey) {
            return hookFailure("symbol must be NIFTY, BANKNIFTY or SENSEX", 400);
          }
          const label = raw === "NIFTY50" ? "NIFTY" : raw;

          const { generatePremiumTrades, sendFnoAlerts } = await import("@/lib/ai-trades.server");
          const { buildMockChain, buildMockPlan } = await import("@/lib/mock-chain.server");

          // Live Upstox data first. A simulated chain/plan is used only when
          // ALLOW_MOCK_DATA=true is set explicitly; otherwise nothing is sent.
          const mockAllowed = process.env.ALLOW_MOCK_DATA === "true";
          let chain;
          let expiry = "";
          let simulated = false;
          const errors: string[] = [];
          try {
            const { getAccessToken, fetchExpiries, fetchOptionChain } =
              await import("@/lib/upstox.server");
            const token = getAccessToken();
            const expiries = await fetchExpiries(instrumentKey, token);
            expiry = expiries[0] ?? "";
            if (!expiry) throw new Error("No expiry available");
            chain = await fetchOptionChain(instrumentKey, expiry, token);
          } catch (liveErr) {
            errors.push(`live chain: ${(liveErr as Error).message}`);
            if (!mockAllowed) {
              return hookFailure(
                `Live option chain unavailable (${(liveErr as Error).message}). Set ALLOW_MOCK_DATA=true to send flagged simulated test data.`,
                503,
              );
            }
            console.warn("[fno-alert] live chain unavailable, using simulated test data");
            chain = buildMockChain(label);
            expiry = chain.expiry;
            simulated = true;
          }

          let plan;
          try {
            plan = await generatePremiumTrades(label, chain);
            if (!plan.trades.length) throw new Error("AI returned no trades");
          } catch (aiErr) {
            errors.push(`ai: ${(aiErr as Error).message}`);
            if (!mockAllowed || !simulated) {
              // Never replace a failed AI plan on a REAL chain with sample trades.
              return hookFailure(
                `AI trade generation failed (${(aiErr as Error).message}); nothing sent.`,
                502,
              );
            }
            plan = buildMockPlan(label, chain);
            simulated = true;
          }

          const chatIds = parseChatIds(body.chatIds);
          const notified = await sendFnoAlerts(plan, chatIds.length ? chatIds : undefined);

          console.log(
            `[fno-alert] ${label} ${expiry} simulated=${simulated} cards=${notified.cards} sent=${notified.sent}/${notified.total}`,
          );
          return Response.json(
            {
              ok: notified.sent > 0,
              sent: notified.sent,
              skipped: 0,
              errors,
              symbol: label,
              expiry,
              simulated,
              trades: plan.trades.length,
              notified,
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
