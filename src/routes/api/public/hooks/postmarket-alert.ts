import { createFileRoute } from "@tanstack/react-router";
import { NIFTY_UNIVERSE, sectorOf } from "@/lib/nifty-universe";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { escapeHtml, getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";
import { fetchQuote, fetchQuotes, toYahooSymbol } from "@/lib/yahoo.server";

interface Quote {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
}

async function fetchIndex(symbol: string): Promise<{ price: number; prev: number } | null> {
  const q = await fetchQuote(symbol);
  return q ? { price: q.price, prev: q.prevClose } : null;
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

const SECTIONS = ["summary", "sectors", "trending", "all"] as const;
type Section = (typeof SECTIONS)[number];

function indexLine(label: string, idx: { price: number; prev: number }): string {
  const chg = idx.price - idx.prev;
  const pct = (chg / idx.prev) * 100;
  return `• ${label}: <b>${fmtPts(idx.price)}</b> (${chg >= 0 ? "+" : ""}${fmtPts(chg)} / ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
}

async function buildMessage(section: Section, quotes: Quote[]): Promise<string> {
  const today = new Date().toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const lines: string[] = [`🌆 <b>InvestIQ — Post-Market Update</b>`, `<i>${today} IST</i>`, ``];

  if (section === "summary" || section === "all") {
    const [nifty, sensex, bank] = await Promise.all([
      fetchIndex("^NSEI"),
      fetchIndex("^BSESN"),
      fetchIndex("^NSEBANK"),
    ]);
    const adv = quotes.filter((q) => q.changePct > 0).length;
    const dec = quotes.filter((q) => q.changePct < 0).length;
    const unc = quotes.length - adv - dec;
    const sentiment = adv > dec * 1.5 ? "🟢 Bullish" : dec > adv * 1.5 ? "🔴 Bearish" : "🟡 Mixed";
    lines.push(`<b>📊 Daily Market Summary</b>`);
    if (nifty) lines.push(indexLine("Nifty 50", nifty));
    if (sensex) lines.push(indexLine("Sensex", sensex));
    if (bank) lines.push(indexLine("Bank Nifty", bank));
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
    for (const s of top)
      lines.push(
        `  • ${escapeHtml(s.name)}: ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}% (${s.count})`,
      );
    lines.push(`<b>Weakest:</b>`);
    for (const s of bot)
      lines.push(
        `  • ${escapeHtml(s.name)}: ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}% (${s.count})`,
      );
    lines.push(``);
  }

  if (section === "trending" || section === "all") {
    const active = [...quotes].sort((a, b) => b.volume - a.volume).slice(0, 5);
    lines.push(`<b>🔥 Trending Stocks (most active)</b>`);
    for (const q of active) {
      lines.push(
        `• <b>${escapeHtml(q.name)}</b> (${escapeHtml(q.symbol)}) — ${fmtInr(q.price)} · <b>${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%</b> · Vol ${fmtVol(q.volume)}`,
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
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);

          const body = await readJsonBody<{ section: Section; chatIds: string[] }>(request);
          const section: Section = body.section ?? "all";
          if (!SECTIONS.includes(section)) {
            return hookFailure(`section must be one of ${SECTIONS.join(", ")}`, 400);
          }
          const chatIds = resolveChatIds(body.chatIds);

          const raw = await fetchQuotes(NIFTY_UNIVERSE.map((s) => toYahooSymbol(s.symbol)));
          const out: Quote[] = [];
          NIFTY_UNIVERSE.forEach((s, i) => {
            const q = raw[i];
            if (!q) return;
            out.push({
              symbol: s.symbol,
              name: s.name,
              sector: sectorOf(s.symbol),
              price: q.price,
              prevClose: q.prevClose,
              changePct: q.changePct,
              volume: q.volume,
            });
          });
          if (out.length === 0) return hookFailure("no quotes fetched", 502);

          const message = await buildMessage(section, out);
          const res = await sendToMany(token, chatIds, message, { delayMs: 150 });
          return hookResponse({
            sent: res.delivered,
            skipped: NIFTY_UNIVERSE.length - out.length,
            errors: res.errors,
            section,
            scanned: out.length,
            delivered: res.delivered,
            recipients: chatIds.length,
          });
        } catch (e) {
          console.error("[postmarket-alert]", (e as Error).message);
          return hookFailure((e as Error).message);
        }
      },
    },
  },
});
