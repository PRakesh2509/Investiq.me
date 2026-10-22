import { createFileRoute } from "@tanstack/react-router";

/**
 * Auto A+ trade alerts.
 *
 * Scans the live option chain for the configured indices, asks the AI engine
 * for premium trades and pushes ONLY grade "A+" ideas to Telegram. Each
 * (symbol, expiry, strike, type, direction) is sent once per day.
 */

const PERMANENT_CHAT_IDS = [
  "7350570004",
  "5589831995",
  "1840901163",
  "1360613728",
  "8155139346",
  "6799336293", "7280324188", "6698697147",
];

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

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`TG(${chatId}): ${json.description ?? "unknown"}`);
}

export const Route = createFileRoute("/api/public/hooks/ai-trade-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          force?: boolean;
          chatIds?: string[];
        };
        const force = !!body.force;
        try {
          if (!force && !marketOpen()) {
            return Response.json({ ok: true, skipped: true, reason: "market closed" });
          }
          const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
          const envIds = (process.env.TELEGRAM_CHAT_ID ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const chatIds = body.chatIds?.length
            ? Array.from(new Set(body.chatIds.map((s) => String(s).trim()).filter(Boolean)))
            : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));

          const { getAccessToken, fetchExpiries, fetchOptionChain, INDEX_UNDERLYINGS } =
            await import("@/lib/upstox.server");
          const { generatePremiumTrades, buildTradeMessage } = await import(
            "@/lib/ai-trades.server"
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const accessToken = getAccessToken();
          const today = istNow().toISOString().slice(0, 10);
          const results: Record<string, unknown>[] = [];

          for (const key of SCAN) {
            const label = INDEX_UNDERLYINGS.find((u) => u.key === key)?.label ?? key;
            try {
              const expiries = await fetchExpiries(key, accessToken);
              const expiry = expiries[0];
              if (!expiry) {
                results.push({ symbol: label, skipped: "no expiry" });
                continue;
              }
              const chain = await fetchOptionChain(key, expiry, accessToken);
              const plan = await generatePremiumTrades(label, chain);
              const aplus = plan.trades.filter((t) => t.grade === "A+");
              if (!aplus.length) {
                results.push({ symbol: label, aplus: 0 });
                continue;
              }

              // Dedupe: one alert per unique A+ trade per day.
              const fresh: typeof aplus = [];
              for (const t of aplus) {
                const tradeKey = `${label}|${expiry}|${t.strike}|${t.optionType}|${t.direction}`;
                if (force) {
                  fresh.push(t);
                  continue;
                }
                const { error } = await supabaseAdmin
                  .from("ai_trade_sent")
                  .insert({ trade_key: tradeKey, sent_date: today });
                if (!error) fresh.push(t);
              }
              if (!fresh.length) {
                results.push({ symbol: label, aplus: aplus.length, new: 0 });
                continue;
              }

              const text = buildTradeMessage({ ...plan, trades: fresh });
              let delivered = 0;
              for (const id of chatIds) {
                try {
                  await sendTelegram(token, id, text);
                  delivered++;
                } catch (e) {
                  console.error("[ai-trade-alert]", (e as Error).message);
                }
                await sleep(300);
              }
              results.push({ symbol: label, aplus: aplus.length, new: fresh.length, delivered });
            } catch (e) {
              console.error("[ai-trade-alert]", label, (e as Error).message);
              results.push({ symbol: label, error: (e as Error).message });
            }
            await sleep(500);
          }

          return Response.json({ ok: true, results }, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          const err = e as Error;
          console.error("[ai-trade-alert]", err.message);
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
