import { createFileRoute } from "@tanstack/react-router";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";

/**
 * Auto A+ trade alerts.
 *
 * Scans the live option chain for the configured indices, asks the AI engine
 * for premium trades and pushes ONLY grade "A+" ideas to Telegram. Each
 * (symbol, expiry, strike, type, direction) is sent once per day.
 * Requires CRON_SECRET (x-cron-secret or Authorization: Bearer).
 */

const SCAN = ["NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank"];
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

        const body = await readJsonBody<{ force: boolean; chatIds: string[] }>(request);
        const force = !!body.force;
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
          const chatIds = resolveChatIds(body.chatIds);

          const { getAccessToken, fetchExpiries, fetchOptionChain, INDEX_UNDERLYINGS } =
            await import("@/lib/upstox.server");
          const { generatePremiumTrades, buildTradeMessage } =
            await import("@/lib/ai-trades.server");
          const { claimOnce, releaseClaim } = await import("@/lib/hook-dedupe.server");

          const accessToken = getAccessToken();
          const today = istNow().toISOString().slice(0, 10);
          const results: Record<string, unknown>[] = [];
          const errors: string[] = [];
          let sent = 0;
          let skipped = 0;
          let dedupeUnavailable = false;

          for (const key of SCAN) {
            const label = INDEX_UNDERLYINGS.find((u) => u.key === key)?.label ?? key;
            try {
              const expiries = await fetchExpiries(key, accessToken);
              const expiry = expiries[0];
              if (!expiry) {
                skipped++;
                results.push({ symbol: label, skipped: "no expiry" });
                continue;
              }
              const chain = await fetchOptionChain(key, expiry, accessToken);
              const plan = await generatePremiumTrades(label, chain);
              const aplus = plan.trades.filter((t) => t.grade === "A+");
              if (!aplus.length) {
                skipped++;
                results.push({ symbol: label, aplus: 0 });
                continue;
              }

              // Dedupe: one alert per unique A+ trade per day (insert-first, race-safe).
              const fresh: typeof aplus = [];
              const claimed: string[] = [];
              for (const t of aplus) {
                const tradeKey = `${label}|${expiry}|${t.strike}|${t.optionType}|${t.direction}`;
                if (force) {
                  fresh.push(t);
                  continue;
                }
                const claim = await claimOnce(
                  "ai_trade_sent",
                  { trade_key: tradeKey, sent_date: today },
                  `${tradeKey}|${today}`,
                );
                if (claim === "duplicate") {
                  skipped++;
                  continue;
                }
                if (claim === "unavailable") dedupeUnavailable = true;
                else claimed.push(tradeKey);
                fresh.push(t);
              }
              if (!fresh.length) {
                results.push({ symbol: label, aplus: aplus.length, new: 0 });
                continue;
              }

              const text = buildTradeMessage({ ...plan, trades: fresh });
              const res = await sendToMany(token, chatIds, text, { delayMs: 300 });
              sent += res.delivered;
              errors.push(...res.errors);
              if (res.delivered === 0) {
                // Nobody got it: free the claims so the next run retries.
                for (const k of claimed) {
                  await releaseClaim(
                    "ai_trade_sent",
                    { trade_key: k, sent_date: today },
                    `${k}|${today}`,
                  );
                }
              }
              results.push({
                symbol: label,
                aplus: aplus.length,
                new: fresh.length,
                delivered: res.delivered,
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
