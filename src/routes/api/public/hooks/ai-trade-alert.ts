import { createFileRoute } from "@tanstack/react-router";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { getBotToken, resolveChatIds } from "@/lib/telegram.server";

/**
 * Auto Grade A+ F&O sniper trade alerts.
 *
 * Scans the live derivatives chain for major Indian indices (NIFTY 50, BANK NIFTY),
 * prompts the institutional derivative quant engine, and pushes ONLY Grade A+
 * sniper setups directly to Telegram using the verified boxed card layout.
 * Enforces strict 1-trade cap per index to prevent overflow.
 *
 * Requires CRON_SECRET (x-cron-secret or Authorization: Bearer).
 */

const SCAN = ["NIFTY", "BANKNIFTY"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function istNow() {
  return new Date(Date.now() + 5.5 * 3600 * 1000);
}

/** Mon–Fri, 09:15–15:30 IST */
function marketOpen() {
  const d = istNow();
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export const Route = createFileRoute("/api/public/hooks/ai-trade-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;

        const body = await readJsonBody<{ force?: boolean; chatIds?: string[] }>(request);
        const force = !!body?.force;
        try {
          if (!force && !marketOpen()) {
            return hookResponse({
              sent: 0,
              skipped: 1,
              errors: [],
              reason: "market closed",
            });
          }
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);
          const chatIds = resolveChatIds(body?.chatIds);

          const { getLiveDerivativesChain, generatePremiumTrades, sendFnoAlerts } =
            await import("@/lib/ai-trades.server.ts");
          const { claimOnce, releaseClaim } = await import("@/lib/hook-dedupe.server.ts");

          const today = istNow().toISOString().slice(0, 10);
          const results: Record<string, unknown>[] = [];
          const errors: string[] = [];
          let sent = 0;
          let skipped = 0;
          let dedupeUnavailable = false;

          for (const label of SCAN) {
            try {
              const chain = await getLiveDerivativesChain(label);
              const plan = await generatePremiumTrades(label, chain);
              const aplus = plan.trades.filter((t) => t.grade === "A+");
              if (!aplus.length) {
                skipped++;
                results.push({ symbol: label, aplus: 0 });
                continue;
              }

              // Top 1 highest conviction trade
              const bestTrade = aplus[0];
              const tradeKey = `${label}|${plan.expiry}|${bestTrade.strike}|${bestTrade.optionType}|${bestTrade.direction}`;

              if (!force) {
                const claim = await claimOnce(
                  "ai_trade_sent",
                  { trade_key: tradeKey, sent_date: today },
                  `${tradeKey}|${today}`,
                );
                if (claim === "duplicate") {
                  skipped++;
                  results.push({ symbol: label, skipped: "already sent today" });
                  continue;
                }
                if (claim === "unavailable") dedupeUnavailable = true;
              }

              // Send the single best setup in the sniper card format
              const notify = await sendFnoAlerts(
                { ...plan, trades: [bestTrade] },
                chatIds,
                1,
              );
              sent += notify.sent;

              if (notify.sent === 0 && !force) {
                await releaseClaim(
                  "ai_trade_sent",
                  { trade_key: tradeKey, sent_date: today },
                  `${tradeKey}|${today}`,
                );
              }

              results.push({
                symbol: label,
                strike: bestTrade.strike,
                type: bestTrade.optionType,
                delivered: notify.sent,
              });
            } catch (e) {
              const msg = `${label}: ${(e as Error).message}`;
              console.error("[ai-trade-alert]", msg);
              errors.push(msg);
              results.push({ symbol: label, error: (e as Error).message });
            }
            await sleep(500);
          }

          return hookResponse({
            sent,
            skipped,
            errors,
            recipients: chatIds.length,
            dedupe: dedupeUnavailable ? "unavailable" : "ok",
            results,
          });
        } catch (e) {
          const err = e as Error;
          console.error("[ai-trade-alert]", err.message);
          return hookFailure(err.message);
        }
      },
    },
  },
});
