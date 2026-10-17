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
  sector: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
}

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
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0);
    if (!price || !prev) return null;
    return {
      symbol,
      name,
      sector: sectorOf(symbol),
      price,
      prevClose: prev,
      changePct: ((price - prev) / prev) * 100,
      volume: Number(meta.regularMarketVolume ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchIndex(symbol: string): Promise<{ price: number; prev: number } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice ?? 0);
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0);
    if (!price || !prev) return null;
    return { price, prev };
  } catch {
    return null;
  }
}

function fmtInr(n: number, dp = 2): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;
}
function fmtPts(n: number, dp = 2): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp });
}
function fmtVol(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return n.toString();
}

type Section = "summary" | "sectors" | "trending" | "all";

async function buildMessage(section: Section, quotes: Quote[]): Promise<string> {
  const today = new Date().toLocaleString("en-IN", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  const lines: string[] = [
    `🌆 <b>InvestIQ — Post-Market Update</b>`,
    `<i>${today} IST</i>`,
    ``,
  ];

  if (section === "summary" || section === "all") {
    const [nifty, sensex, bank] = await Promise.all([
      fetchIndex("^NSEI"),
      fetchIndex("^BSESN"),
      fetchIndex("^NSEBANK"),
    ]);
    const adv = quotes.filter((q) => q.changePct > 0).length;
    const dec = quotes.filter((q) => q.changePct < 0).length;
    const unc = quotes.length - adv - dec;
    const sentiment =
      adv > dec * 1.5 ? "🟢 Bullish"
      : dec > adv * 1.5 ? "🔴 Bearish"
      : "🟡 Mixed";
    lines.push(`<b>📊 Daily Market Summary</b>`);
    if (nifty) {
      const chg = nifty.price - nifty.prev;
      const pct = (chg / nifty.prev) * 100;
      lines.push(`• Nifty 50: <b>${fmtPts(nifty.price)}</b> (${chg >= 0 ? "+" : ""}${fmtPts(chg)} / ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
    }
    if (sensex) {
      const chg = sensex.price - sensex.prev;
      const pct = (chg / sensex.prev) * 100;
      lines.push(`• Sensex: <b>${fmtPts(sensex.price)}</b> (${chg >= 0 ? "+" : ""}${fmtPts(chg)} / ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
    }
    if (bank) {
      const chg = bank.price - bank.prev;
      const pct = (chg / bank.prev) * 100;
      lines.push(`• Bank Nifty: <b>${fmtPts(bank.price)}</b> (${chg >= 0 ? "+" : ""}${fmtPts(chg)} / ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
    }
    lines.push(`• Sentiment: <b>${sentiment}</b>`);
    lines.push(`• Advance / Decline / Unchanged: <b>${adv}</b> · <b>${dec}</b> · <b>${unc}</b>`);
    lines.push(``);
  }

  if (section === "sectors" || section === "all") {
    const buckets = new Map<string, { total: number; sum: number }>();
    for (const q of quotes) {
      const b = buckets.get(q.sector) ?? { total: 0, sum: 0 };
      b.total += 1;
      b.sum += q.changePct;
      buckets.set(q.sector, b);
    }
    const sectors = [...buckets.entries()]
      .map(([name, b]) => ({ name, avg: b.sum / b.total, count: b.total }))
      .sort((a, b) => b.avg - a.avg);
    const top = sectors.slice(0, 3);
    const bot = sectors.slice(-3).reverse();
    lines.push(`<b>🏭 Sector Performance</b>`);
    lines.push(`<b>Top:</b>`);
    for (const s of top) lines.push(`  • ${s.name}: ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}% (${s.count})`);
    lines.push(`<b>Weakest:</b>`);
    for (const s of bot) lines.push(`  • ${s.name}: ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}% (${s.count})`);
    lines.push(``);
  }

  if (section === "trending" || section === "all") {
    const active = [...quotes]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
    lines.push(`<b>🔥 Trending Stocks (most active)</b>`);
    for (const q of active) {
      lines.push(
        `• <b>${q.name}</b> (${q.symbol}) — ${fmtInr(q.price)} · <b>${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%</b> · Vol ${fmtVol(q.volume)}`,
      );
    }
    lines.push(``);
  }

  lines.push(`<i>Not investment advice. Consult a SEBI-registered advisor.</i>`);
  return lines.join("\n");
}

export const Route = createFileRoute("/api/public/hooks/postmarket-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
        let body: { section?: Section } = {};
        try { body = (await request.json()) as any; } catch { /* empty body allowed */ }
        const section: Section = body.section ?? "all";

        const envIds = (process.env.TELEGRAM_CHAT_ID ?? "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        const chatIds = Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));

        const out: Quote[] = [];
        const chunk = 12;
        for (let i = 0; i < NIFTY_UNIVERSE.length; i += chunk) {
          const batch = NIFTY_UNIVERSE.slice(i, i + chunk);
          const res = await Promise.all(batch.map((s) => fetchQuote(s.symbol, s.name)));
          for (const q of res) if (q) out.push(q);
        }
        if (out.length === 0) {
          return Response.json({ ok: false, error: "no quotes fetched" }, { status: 502 });
        }

        const message = await buildMessage(section, out);
        const results = await Promise.allSettled(chatIds.map((id) => sendTelegram(token, id, message)));
        const delivered = results.filter((r) => r.status === "fulfilled").length;
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => (r.reason as Error).message);
        return Response.json({
          ok: delivered > 0,
          section,
          scanned: out.length,
          delivered,
          recipients: chatIds,
          errors,
        });
      },
    },
  },
});
