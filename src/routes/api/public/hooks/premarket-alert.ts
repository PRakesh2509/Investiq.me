import { createFileRoute } from "@tanstack/react-router";
import { NIFTY_UNIVERSE, sectorOf } from "@/lib/nifty-universe";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { escapeHtml, getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";
import { fetchQuotes, toYahooSymbol } from "@/lib/yahoo.server";

interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
  high52: number;
  low52: number;
}

// Yahoo v8 chart endpoint provides price + 52-week range + volume without auth.
async function fetchAll(): Promise<Quote[]> {
  const raw = await fetchQuotes(NIFTY_UNIVERSE.map((s) => toYahooSymbol(s.symbol)));
  const out: Quote[] = [];
  NIFTY_UNIVERSE.forEach((s, i) => {
    const q = raw[i];
    if (!q) return;
    out.push({
      symbol: s.symbol,
      name: s.name,
      price: q.price,
      prevClose: q.prevClose,
      changePct: q.changePct,
      volume: q.volume,
      high52: q.fiftyTwoWeekHigh,
      low52: q.fiftyTwoWeekLow,
    });
  });
  return out;
}

// 52-week range as volatility proxy → risk / horizon buckets.
// Low <35%, Medium 35–70%, High >70%.
function riskBucket(q: Quote): {
  risk: "Low" | "Medium" | "High";
  horizon: string;
  volatility: number;
} {
  const vol = q.low52 > 0 ? ((q.high52 - q.low52) / q.low52) * 100 : 0;
  if (vol < 35) return { risk: "Low", horizon: "2–4 weeks", volatility: vol };
  if (vol < 70) return { risk: "Medium", horizon: "3–5 days", volatility: vol };
  return { risk: "High", horizon: "Intraday", volatility: vol };
}

function fmtInr(n: number): string {
  if (!isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}
function fmtVol(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return n.toString();
}

export const Route = createFileRoute("/api/public/hooks/premarket-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);
          const body = await readJsonBody<{ chatIds: string[] }>(request);
          const chatIds = resolveChatIds(body.chatIds);

          const quotes = await fetchAll();
          if (quotes.length === 0) return hookFailure("no quotes fetched", 502);

          // Top gainers by previous-close % change (pre-market proxy).
          const gainers = [...quotes]
            .filter((q) => q.changePct > 0)
            .sort((a, b) => b.changePct - a.changePct)
            .slice(0, 5);

          const today = new Date().toLocaleString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          });

          const lines: string[] = [
            `🌅 <b>InvestIQ — Pre-Market Alert</b>`,
            `<i>${today} IST · market opens 9:15 AM</i>`,
            ``,
            `<b>🚀 Top 5 Gainers (previous close basis)</b>`,
            ``,
          ];

          for (let i = 0; i < gainers.length; i++) {
            const q = gainers[i];
            const { risk, horizon, volatility } = riskBucket(q);
            const entry = q.price;
            const avg = entry * 0.97; // −3% average-down level
            lines.push(
              `<b>${i + 1}. ${escapeHtml(q.name)}</b> <code>${escapeHtml(q.symbol)}</code>`,
              `   ▸ Sector: ${escapeHtml(sectorOf(q.symbol))}`,
              `   ▸ Entry: <b>${fmtInr(entry)}</b> · Avg (-3%): ${fmtInr(avg)}`,
              `   ▸ Horizon: ${horizon} · Risk: <b>${risk}</b>`,
              `   ▸ % Chg: <b>${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%</b> · Vol: ${fmtVol(q.volume)}`,
              `   ▸ 52W: ${fmtInr(q.low52)} – ${fmtInr(q.high52)} (band ${volatility.toFixed(0)}%)`,
              ``,
            );
          }

          lines.push(
            `<i>Entry = last close; Avg = entry × 0.97; Risk band from 52W range (Low &lt;35%, Med 35–70%, High &gt;70%).</i>`,
            `<i>Not investment advice. Consult a SEBI-registered advisor.</i>`,
          );

          const res = await sendToMany(token, chatIds, lines.join("\n"), { delayMs: 150 });
          return hookResponse({
            sent: res.delivered,
            skipped: NIFTY_UNIVERSE.length - quotes.length,
            errors: res.errors,
            scanned: quotes.length,
            gainers: gainers.length,
            delivered: res.delivered,
            recipients: chatIds.length,
          });
        } catch (e) {
          console.error("[premarket-alert]", (e as Error).message);
          return hookFailure((e as Error).message);
        }
      },
    },
  },
});
