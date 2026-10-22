import { createFileRoute } from "@tanstack/react-router";
import { NIFTY_UNIVERSE, sectorOf } from "@/lib/nifty-universe";

const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"];

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
  if (!json.ok) throw new Error(`Telegram(${chatId}): ${json.description ?? "unknown"}`);
}

interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
  high52: number;
  low52: number;
  marketCap: number;
}

// Yahoo v8 chart endpoint provides price + 52-week range + volume without auth.
async function fetchQuote(symbol: string, name: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}.NS?interval=1d&range=5d`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const r = j?.chart?.result?.[0];
    if (!r) return null;
    const meta = r.meta ?? {};
    const price = Number(meta.regularMarketPrice ?? 0);
    const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
    if (!price || !prev) return null;
    return {
      symbol,
      name,
      price,
      prevClose: prev,
      changePct: ((price - prev) / prev) * 100,
      volume: Number(meta.regularMarketVolume ?? 0),
      high52: Number(meta.fiftyTwoWeekHigh ?? 0),
      low52: Number(meta.fiftyTwoWeekLow ?? 0),
      marketCap: 0,
    };
  } catch {
    return null;
  }
}

async function fetchAll(): Promise<Quote[]> {
  const out: Quote[] = [];
  const chunk = 12;
  for (let i = 0; i < NIFTY_UNIVERSE.length; i += chunk) {
    const batch = NIFTY_UNIVERSE.slice(i, i + chunk);
    const res = await Promise.all(batch.map((s) => fetchQuote(s.symbol, s.name)));
    for (const q of res) if (q) out.push(q);
  }
  return out;
}

// 52-week range as volatility proxy → risk / horizon buckets.
// Low <35%, Medium 35–70%, High >70%.
function riskBucket(q: Quote): { risk: "Low" | "Medium" | "High"; horizon: string; volatility: number } {
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
        const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
        const body = (await request?.json().catch(() => ({}))) as { chatIds?: string[] } | undefined;
        const envIds = (process.env.TELEGRAM_CHAT_ID ?? "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        const chatIds = body?.chatIds?.length
          ? Array.from(new Set(body.chatIds.map((s) => String(s).trim()).filter(Boolean)))
          : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));

        const quotes = await fetchAll();
        if (quotes.length === 0) {
          return Response.json({ ok: false, error: "no quotes fetched" }, { status: 502 });
        }
        // Top gainers by previous-close % change (pre-market proxy).
        const gainers = [...quotes]
          .filter((q) => q.changePct > 0)
          .sort((a, b) => b.changePct - a.changePct)
          .slice(0, 5);

        const today = new Date().toLocaleString("en-IN", {
          weekday: "short", day: "2-digit", month: "short",
          hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
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
            `<b>${i + 1}. ${q.name}</b> <code>${q.symbol}</code>`,
            `   ▸ Sector: ${sectorOf(q.symbol)}`,
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
        const message = lines.join("\n");

        const results = await Promise.allSettled(chatIds.map((id) => sendTelegram(token, id, message)));
        const delivered = results.filter((r) => r.status === "fulfilled").length;
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => (r.reason as Error).message);
        return Response.json({
          ok: delivered > 0,
          scanned: quotes.length,
          gainers: gainers.length,
          delivered,
          recipients: chatIds,
          errors,
        });
      },
    },
  },
});
