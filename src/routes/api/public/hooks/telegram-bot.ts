import { createFileRoute } from "@tanstack/react-router";
import { ipoStatusLabel } from "@/lib/ipos";
import { getLiveIpos } from "@/lib/ipos.functions";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";

// Interactive Telegram bot webhook. Register via:
//   curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PUBLIC_URL>/api/public/hooks/telegram-bot"

async function sendMessage(token: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
}

// Yahoo's v7 /finance/quote now requires a crumb (401). Derive quote fields
// from the v8 chart endpoint's meta block instead — no auth required.
type YQuote = {
  symbol: string;
  name: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
};

async function fetchChart(symbol: string, range = "6mo", interval = "1d") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return json?.chart?.result?.[0] ?? null;
}

async function fetchQuote(symbol: string): Promise<YQuote | null> {
  const r = await fetchChart(symbol, "5d", "1d");
  if (!r) return null;
  const m = r.meta ?? {};
  const price = Number(m.regularMarketPrice ?? 0);
  if (!price) return null;
  const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
  const change = price - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  return {
    symbol: m.symbol ?? symbol,
    name: m.longName ?? m.shortName ?? symbol,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: changePct,
    regularMarketVolume: Number(m.regularMarketVolume ?? 0),
    fiftyTwoWeekHigh: Number(m.fiftyTwoWeekHigh ?? 0),
    fiftyTwoWeekLow: Number(m.fiftyTwoWeekLow ?? 0),
  };
}

async function fetchDailyCloses(symbol: string, range = "6mo"): Promise<number[]> {
  const r = await fetchChart(symbol, range, "1d");
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  return (closes as (number | null)[]).filter((v): v is number => typeof v === "number");
}


function rsi14(closes: number[]): number {
  if (closes.length < 15) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / 14, avgL = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * 13 + Math.max(d, 0)) / 14;
    avgL = (avgL * 13 + Math.max(-d, 0)) / 14;
  }
  const rs = avgG / (avgL || 1e-9);
  return 100 - 100 / (1 + rs);
}

function sma(closes: number[], n: number): number {
  if (closes.length < n) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function resolveSymbol(input: string): string {
  const q = input.trim().toUpperCase().replace(/^\/SEARCH\s+/, "");
  // Direct match to Nifty universe
  const direct = NIFTY_UNIVERSE.find((s) => s.symbol === q || s.name.toUpperCase() === q);
  if (direct) return `${direct.symbol}.NS`;
  // Loose match by name contains
  const loose = NIFTY_UNIVERSE.find((s) => s.name.toUpperCase().includes(q));
  if (loose) return `${loose.symbol}.NS`;
  // Fallback: assume user gave a Yahoo symbol
  return q.includes(".") ? q : `${q}.NS`;
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

async function handleSearch(token: string, chatId: number, input: string) {
  const symbol = resolveSymbol(input);
  const [q, closes] = await Promise.all([fetchQuote(symbol), fetchDailyCloses(symbol, "6mo")]);
  if (!q || !q.regularMarketPrice) {
    await sendMessage(token, chatId, `❌ Could not find <code>${symbol}</code>. Try a Nifty 50 ticker like <code>INFY</code> or <code>TCS</code>.`);
    return;
  }
  const price = q.regularMarketPrice;
  const rsi = rsi14(closes);
  const s20 = sma(closes, 20);
  const s200 = sma(closes, 200);
  const rsiTag = rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral";
  const macdBias = s20 > s200 ? "BULLISH" : "BEARISH";
  const target = price * 1.13;
  const entryLo = price * 0.97, entryHi = price * 0.99;
  const exitLo = price * 1.05, exitHi = price * 1.08;
  const stop = price * 0.95;
  const change = q.regularMarketChange ?? 0;
  const changePct = q.regularMarketChangePercent ?? 0;
  const sign = change >= 0 ? "+" : "";
  const name = q.name || symbol;

  const lines = [
    `📊 <b>${name}</b> · <code>${symbol}</code>`,
    ``,
    `💹 <b>PRICE:</b> ₹${fmt(price)}`,
    `📈 Change: ${sign}${fmt(change)} (${sign}${fmt(changePct)}%)`,
    q.regularMarketVolume ? `Vol: ${fmt(q.regularMarketVolume, 0)}` : ``,
    ``,
    `🎯 <b>TARGET:</b> ₹${fmt(target)} (Upside ~13%)`,
    ``,
    `<b>TRADING LEVELS</b>`,
    `🟢 Entry: ₹${fmt(entryLo)} – ₹${fmt(entryHi)}`,
    `🟠 Exit:  ₹${fmt(exitLo)} – ₹${fmt(exitHi)}`,
    `🛑 Stop loss: ₹${fmt(stop)}`,
    ``,
    `💡 <b>TECHNICALS</b>`,
    `RSI(14): ${fmt(rsi, 1)} (${rsiTag})`,
    `Trend: ${macdBias} · 20-DMA ₹${fmt(s20)} · 200-DMA ₹${fmt(s200)}`,
    ``,
    `📈 <b>KEY METRICS</b>`,
    q.fiftyTwoWeekHigh ? `52W: ₹${fmt(q.fiftyTwoWeekLow)} – ₹${fmt(q.fiftyTwoWeekHigh)}` : ``,
    ``,

    `⚠️ AI-based research only · <b>Not investment advice</b> · Not SEBI registered.`,
  ].filter(Boolean);
  await sendMessage(token, chatId, lines.join("\n"));
}

async function fetchUniverseQuotes() {
  const results = await Promise.all(
    NIFTY_UNIVERSE.map(async (s) => {
      const q = await fetchQuote(`${s.symbol}.NS`);
      return q ? { ...q, base: s.symbol, sector: s.sector } : null;
    }),
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

async function handleGainersLosers(token: string, chatId: number, kind: "gainers" | "losers") {
  const list = await fetchUniverseQuotes();
  if (list.length === 0) {
    await sendMessage(token, chatId, "❌ Could not fetch live data right now.");
    return;
  }
  const sorted = [...list].sort((a, b) =>
    kind === "gainers"
      ? b.regularMarketChangePercent - a.regularMarketChangePercent
      : a.regularMarketChangePercent - b.regularMarketChangePercent,
  ).slice(0, 10);
  const title = kind === "gainers" ? "📈 Top 10 Gainers" : "📉 Top 10 Losers";
  const rows = sorted.map((q, i) => {
    const pct = q.regularMarketChangePercent;
    const sign = pct >= 0 ? "+" : "";
    return `<b>#${i + 1}</b> <code>${q.base}</code>  ₹${fmt(q.regularMarketPrice)}  <b>${sign}${fmt(pct)}%</b>`;
  });
  await sendMessage(token, chatId, [title, "", ...rows].join("\n"));
}

async function handleSectors(token: string, chatId: number) {
  const list = await fetchUniverseQuotes();
  if (list.length === 0) {
    await sendMessage(token, chatId, "❌ Could not fetch sector data.");
    return;
  }
  const map = new Map<string, { sum: number; up: number; down: number; n: number }>();
  for (const q of list) {
    const pct = q.regularMarketChangePercent;
    const cur = map.get(q.sector) ?? { sum: 0, up: 0, down: 0, n: 0 };
    cur.sum += pct; cur.n += 1;
    if (pct >= 0) cur.up += 1; else cur.down += 1;
    map.set(q.sector, cur);
  }
  const rows = Array.from(map.entries())
    .map(([sec, v]) => ({ sec, avg: v.sum / v.n, up: v.up, down: v.down }))
    .sort((a, b) => b.avg - a.avg)
    .map((r) => {
      const sign = r.avg >= 0 ? "+" : "";
      return `<b>${r.sec}</b>: ${sign}${fmt(r.avg)}%  🟢${r.up} 🔴${r.down}`;
    });
  await sendMessage(token, chatId, ["🏭 <b>Trending Sectors</b>", "", ...rows].join("\n"));
}


async function handleIpos(token: string, chatId: number) {
  const live = await getLiveIpos();
  const upcoming = live.ipos.filter((i) => i.status === "upcoming" || i.status === "open");
  const rows = upcoming.map(

    (i) =>
      `<b>${i.company}</b> — ${ipoStatusLabel(i.status)}\n  ${i.priceBand} · opens ${i.openDate} · closes ${i.closeDate}`,
  );
  await sendMessage(
    token,
    chatId,
    ["🚀 <b>Upcoming & Open IPOs</b>", "", ...rows, "", "Track live: https://www.investiqq.me/desktop/ipos"].join("\n"),
  );
}

async function handleHelp(token: string, chatId: number) {
  const help = [
    "🤖 <b>InvestIQ Bot Commands</b>",
    "",
    "<code>/search INFY</code> — full stock analysis",
    "Or just send the ticker: <code>TCS</code>",
    "<code>/gainers</code> — top 10 gainers now",
    "<code>/losers</code> — top 10 losers now",
    "<code>/sectors</code> — sector performance",
    "<code>/ipos</code> — upcoming IPOs",
    "<code>/help</code> — this menu",
    "",
    "⚠️ Not investment advice.",
  ];
  await sendMessage(token, chatId, help.join("\n"));
}

export const Route = createFileRoute("/api/public/hooks/telegram-bot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
        if (!token) return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });

        let update: any;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }

        // Direct trade signal action dispatched from Trading Terminal Workstation
        if (update?.action === "trade_signal") {
          const targetChatId = process.env.TELEGRAM_CHAT_ID || "7350570004";
          const isCall = update.direction === "BUY_CALL" || update.contract?.includes("CE");
          const msg = [
            `⚡ <b>INVESTIQ TRADING TERMINAL SIGNAL</b>`,
            ``,
            `🎯 <b>Contract:</b> <code>${update.contract || update.instrument}</code>`,
            `📊 <b>Direction:</b> ${isCall ? "🟢 BUY CALL" : "🔴 BUY PUT"}`,
            `📍 <b>Spot Entry:</b> ${update.entry}`,
            `🎯 <b>Target 1 (TP1):</b> ${update.tp1}`,
            `🎯 <b>Target 2 (TP2):</b> ${update.tp2}`,
            `🛑 <b>Stop Loss (SL):</b> ${update.sl}`,
            `⏱ <b>Source:</b> TradingView Confluence Engine`,
            ``,
            `🔗 <a href="https://www.investiqq.me/desktop/terminal">Open Live Terminal</a>`,
            `⚠️ <i>Institutional education & research setup. Trade responsibly.</i>`,
          ].join("\n");

          await sendMessage(token, targetChatId, msg);
          return Response.json({ ok: true, sentTo: targetChatId });
        }

        const message = update?.message ?? update?.edited_message;
        const chatId: number | undefined = message?.chat?.id;
        const text: string = (message?.text ?? "").trim();
        if (!chatId || !text) return Response.json({ ok: true, ignored: true });

        try {
          const lower = text.toLowerCase();
          if (lower === "/start" || lower === "/help") await handleHelp(token, chatId);
          else if (lower === "/gainers") await handleGainersLosers(token, chatId, "gainers");
          else if (lower === "/losers") await handleGainersLosers(token, chatId, "losers");
          else if (lower === "/sectors") await handleSectors(token, chatId);
          else if (lower === "/ipos") await handleIpos(token, chatId);
          else if (lower.startsWith("/search")) await handleSearch(token, chatId, text.replace(/^\/search/i, "").trim() || "RELIANCE");
          else if (lower.startsWith("/")) await handleHelp(token, chatId);
          else await handleSearch(token, chatId, text);
        } catch (e) {
          await sendMessage(token, chatId, `❌ Error: ${(e as Error).message}`);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
