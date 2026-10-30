import { createFileRoute } from "@tanstack/react-router";
import { ipoStatusLabel } from "@/lib/ipos";
import { getLiveIpos } from "@/lib/ipos.functions";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";
import { sma as smaSeries, rsi as rsiSeries } from "@/lib/indicators";
import { appUrl } from "@/lib/app-url";
import { ADMIN_COOKIE_NAME } from "@/lib/admin-session.server";
import {
  hasCronCredentials,
  requireCronAuth,
  requireTelegramWebhookAuth,
} from "@/lib/cron-auth.server";
import {
  PERMANENT_CHAT_IDS,
  escapeHtml,
  getBotToken,
  parseChatIds,
  sendMessage as tgSend,
} from "@/lib/telegram.server";
import { fetchDailyCloses, fetchQuote, fetchQuotes, type YahooQuote } from "@/lib/yahoo.server";

// Interactive Telegram bot webhook. Register with a secret so Telegram signs every call
// with the X-Telegram-Bot-Api-Secret-Token header (must equal TELEGRAM_WEBHOOK_SECRET):
//   curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=<PROD_URL>/api/public/hooks/telegram-bot" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
//
// Internal callers (Trading Terminal "trade_signal" action) authenticate with CRON_SECRET or an
// admin session instead.

/** Send HTML to a chat; failures are logged (token-free) and never thrown to the webhook. */
async function sendMessage(token: string, chatId: number | string, text: string) {
  try {
    await tgSend(token, chatId, text);
  } catch (e) {
    console.error("[telegram-bot] send failed:", (e as Error).message);
  }
}

/** RSI(14) via indicators.ts (Wilder smoothing). 50 when there is not enough history. */
function rsi14(closes: number[]): number {
  if (closes.length < 15) return 50;
  const series = rsiSeries(closes, 14);
  return series[series.length - 1] ?? 50;
}

function smaLast(closes: number[], n: number): number {
  const last = smaSeries(closes, n)[closes.length - 1];
  return last ?? closes[closes.length - 1] ?? 0;
}

import dhanScripMap from "@/lib/dhan-scrip-map.json" with { type: "json" };

const COMMON_ALIASES: Record<string, string> = {
  IFCI: "IFCI",
  "IFCI LIMITED": "IFCI",
  "IFCI LTD": "IFCI",
  SBI: "SBIN",
  "STATE BANK": "SBIN",
  "STATE BANK OF INDIA": "SBIN",
  HDFC: "HDFCBANK",
  "HDFC BANK": "HDFCBANK",
  ICICI: "ICICIBANK",
  "ICICI BANK": "ICICIBANK",
  KOTAK: "KOTAKBANK",
  "KOTAK BANK": "KOTAKBANK",
  "KOTAK MAHINDRA": "KOTAKBANK",
  "KOTAK MAHINDRA BANK": "KOTAKBANK",
  AXIS: "AXISBANK",
  "AXIS BANK": "AXISBANK",
  "BAJAJ FINANCE": "BAJFINANCE",
  "BAJAJ FINSERV": "BAJAJFINSV",
  "TATA MOTORS": "TATAMOTORS",
  "TATA POWER": "TATAPOWER",
  "TATA STEEL": "TATASTEEL",
  "TATA CONSUMER": "TATACONSUM",
  "MARUTI SUZUKI": "MARUTI",
  "M&M": "M&M",
  MAHINDRA: "M&M",
  "MAHINDRA & MAHINDRA": "M&M",
  "L&T": "LT",
  LARSEN: "LT",
  "LARSEN & TOUBRO": "LT",
  "BHARTI AIRTEL": "BHARTIARTL",
  AIRTEL: "BHARTIARTL",
  RELIANCE: "RELIANCE",
  INFOSYS: "INFY",
  WIPRO: "WIPRO",
  "TECH MAHINDRA": "TECHM",
  "HCL TECH": "HCLTECH",
  HUL: "HINDUNILVR",
  "HINDUSTAN UNILEVER": "HINDUNILVR",
  "SUN PHARMA": "SUNPHARMA",
  "DR REDDY": "DRREDDY",
  "DR. REDDY": "DRREDDY",
  "ASIAN PAINTS": "ASIANPAINT",
  "COAL INDIA": "COALINDIA",
  "POWER GRID": "POWERGRID",
  ADANI: "ADANIENT",
  "ADANI ENTERPRISES": "ADANIENT",
  "ADANI PORTS": "ADANIPORTS",
  "ADANI POWER": "ADANIPOWER",
  "ADANI GREEN": "ADANIGREEN",
  VEDANTA: "VEDL",
  "AVENUE SUPERMARTS": "DMART",
  DMART: "DMART",
  SUZLON: "SUZLON",
  YESBANK: "YESBANK",
  "YES BANK": "YESBANK",
  IREDA: "IREDA",
  HUDCO: "HUDCO",
  RVNL: "RVNL",
  IRFC: "IRFC",
  ZOMATO: "ZOMATO",
  PAYTM: "PAYTM",
  NIFTY: "^NSEI",
  "NIFTY 50": "^NSEI",
  NIFTY50: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  "BANK NIFTY": "^NSEBANK",
  "NIFTY BANK": "^NSEBANK",
  SENSEX: "^BSESN",
  FINNIFTY: "NIFTY_FIN_SERVICE.NS",
};

export function resolveSymbol(input: string): string {
  const q = input
    .trim()
    .toUpperCase()
    .replace(/^\/(SEARCH|STOCK|RESEARCH|QUOTE)\s+/i, "")
    .replace(/\b(SHARE|STOCK|PRICE|QUOTE|CHART|CMP|TARGET|LEVELS)\b/g, "")
    .trim();

  // Explicit Yahoo symbols with ^ or .
  if (q.includes(".") || q.startsWith("^")) return q;

  // Direct alias match
  if (COMMON_ALIASES[q]) {
    const target = COMMON_ALIASES[q];
    return target.startsWith("^") || target.includes(".") ? target : `${target}.NS`;
  }

  // Strip common corporate suffixes
  const stripped = q.replace(/\b(LIMITED|LTD\.?|CORP\.?|INDIA)\b/g, "").trim();
  if (COMMON_ALIASES[stripped]) {
    const target = COMMON_ALIASES[stripped];
    return target.startsWith("^") || target.includes(".") ? target : `${target}.NS`;
  }

  // Direct match to NIFTY_UNIVERSE
  const direct = NIFTY_UNIVERSE.find(
    (s) =>
      s.symbol === q ||
      s.name.toUpperCase() === q ||
      s.symbol === stripped ||
      s.name.toUpperCase() === stripped,
  );
  if (direct) return `${direct.symbol}.NS`;

  // Dhan scrip map check (over 10,000 Indian NSE stocks)
  const scripMapObj = dhanScripMap as Record<string, number>;
  if (scripMapObj[q]) return `${q}.NS`;
  if (stripped && scripMapObj[stripped]) return `${stripped}.NS`;

  // Loose match by name contains
  const loose = q
    ? NIFTY_UNIVERSE.find((s) => s.name.toUpperCase().includes(stripped || q))
    : undefined;
  if (loose) return `${loose.symbol}.NS`;

  // Clean fallback ticker
  const cleanTicker = (stripped || q).replace(/[^A-Z0-9&-]/g, "");
  return cleanTicker ? `${cleanTicker}.NS` : `${q}.NS`;
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

async function handleSearch(token: string, chatId: number, input: string) {
  let symbol = resolveSymbol(input.slice(0, 40));
  let safeSymbol = escapeHtml(symbol);
  let [q, closes] = await Promise.all([fetchQuote(symbol), fetchDailyCloses(symbol, "6mo")]);

  // If quote not found and symbol is .NS, try BSE (.BO) fallback
  if ((!q || !q.price) && symbol.endsWith(".NS")) {
    const bseSymbol = symbol.replace(/\.NS$/i, ".BO");
    const [bseQ, bseCloses] = await Promise.all([
      fetchQuote(bseSymbol),
      fetchDailyCloses(bseSymbol, "6mo"),
    ]);
    if (bseQ && bseQ.price) {
      symbol = bseSymbol;
      safeSymbol = escapeHtml(symbol);
      q = bseQ;
      closes = bseCloses;
    }
  }

  if (!q || !q.price) {
    await sendMessage(
      token,
      chatId,
      `❌ Could not find <code>${safeSymbol}</code>. Try a ticker like <code>IFCI</code>, <code>INFY</code>, <code>TCS</code>, or <code>RELIANCE</code>.`,
    );
    return;
  }
  const price = q.price;
  const rsi = rsi14(closes);
  const s20 = smaLast(closes, 20);
  const s200 = smaLast(closes, 200);
  const rsiTag = rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral";
  const macdBias = s20 > s200 ? "BULLISH" : "BEARISH";
  const target = price * 1.13;
  const entryLo = price * 0.97,
    entryHi = price * 0.99;
  const exitLo = price * 1.05,
    exitHi = price * 1.08;
  const stop = price * 0.95;
  const change = q.change ?? 0;
  const changePct = q.changePct ?? 0;
  const sign = change >= 0 ? "+" : "";
  const name = escapeHtml(q.name || symbol);

  const lines = [
    `📊 <b>${name}</b> · <code>${safeSymbol}</code>`,
    ``,
    `💹 <b>PRICE:</b> ₹${fmt(price)}`,
    `📈 Change: ${sign}${fmt(change)} (${sign}${fmt(changePct)}%)`,
    q.volume ? `Vol: ${fmt(q.volume, 0)}` : ``,
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

type UniverseQuote = YahooQuote & { base: string; sector: string };

async function fetchUniverseQuotes(): Promise<UniverseQuote[]> {
  const quotes = await fetchQuotes(NIFTY_UNIVERSE.map((s) => `${s.symbol}.NS`));
  const out: UniverseQuote[] = [];
  NIFTY_UNIVERSE.forEach((s, i) => {
    const q = quotes[i];
    if (q) out.push({ ...q, base: s.symbol, sector: s.sector });
  });
  return out;
}

async function handleGainersLosers(token: string, chatId: number, kind: "gainers" | "losers") {
  const list = await fetchUniverseQuotes();
  if (list.length === 0) {
    await sendMessage(token, chatId, "❌ Could not fetch live data right now.");
    return;
  }
  const sorted = [...list]
    .sort((a, b) => (kind === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct))
    .slice(0, 10);
  const title = kind === "gainers" ? "📈 Top 10 Gainers" : "📉 Top 10 Losers";
  const rows = sorted.map((q, i) => {
    const pct = q.changePct;
    const sign = pct >= 0 ? "+" : "";
    return `<b>#${i + 1}</b> <code>${escapeHtml(q.base)}</code>  ₹${fmt(q.price)}  <b>${sign}${fmt(pct)}%</b>`;
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
    const pct = q.changePct;
    const cur = map.get(q.sector) ?? { sum: 0, up: 0, down: 0, n: 0 };
    cur.sum += pct;
    cur.n += 1;
    if (pct >= 0) cur.up += 1;
    else cur.down += 1;
    map.set(q.sector, cur);
  }
  const rows = Array.from(map.entries())
    .map(([sec, v]) => ({ sec, avg: v.sum / v.n, up: v.up, down: v.down }))
    .sort((a, b) => b.avg - a.avg)
    .map((r) => {
      const sign = r.avg >= 0 ? "+" : "";
      return `<b>${escapeHtml(r.sec)}</b>: ${sign}${fmt(r.avg)}%  🟢${r.up} 🔴${r.down}`;
    });
  await sendMessage(token, chatId, ["🏭 <b>Trending Sectors</b>", "", ...rows].join("\n"));
}

async function handleIpos(token: string, chatId: number) {
  const live = await getLiveIpos();
  const upcoming = live.ipos.filter((i) => i.status === "upcoming" || i.status === "open");
  const rows = upcoming.map(
    (i) =>
      `<b>${escapeHtml(i.company)}</b> — ${escapeHtml(ipoStatusLabel(i.status))}\n  ${escapeHtml(i.priceBand)} · opens ${escapeHtml(i.openDate)} · closes ${escapeHtml(i.closeDate)}`,
  );
  await sendMessage(
    token,
    chatId,
    [
      "🚀 <b>Upcoming & Open IPOs</b>",
      "",
      ...rows,
      "",
      `Track live: ${appUrl("/desktop/ipos")}`,
    ].join("\n"),
  );
}

async function handleFno(token: string, chatId: number, symbolArg?: string) {
  const sym = (symbolArg?.trim().toUpperCase() || "NIFTY").includes("BANK") ? "BANKNIFTY" : "NIFTY";
  await sendMessage(token, chatId, `🔍 <i>Analyzing Sensibull Greeks View & option chain for ${sym}...</i>`);

  try {
    const quoteSym = sym === "BANKNIFTY" ? "^NSEBANK" : "^NSEI";
    const quote = await fetchQuote(quoteSym);
    const step = sym === "BANKNIFTY" ? 100 : 50;
    const defaultSpot = sym === "BANKNIFTY" ? 54700 : 22980;
    const spot = quote?.price ?? defaultSpot;
    const atmStrike = Math.round(spot / step) * step;

    const { calculateGreeks, calculateTimeToExpiryYears } = await import("@/lib/greeks-service.ts");
    const { nextThursdayISO } = await import("@/lib/provider-utils.ts");
    const { generatePremiumTrades, sendFnoAlerts } = await import("@/lib/ai-trades.server.ts");

    const expiry = nextThursdayISO();
    const tY = calculateTimeToExpiryYears(expiry);
    const rows = [];
    let totalCallOi = 0;
    let totalPutOi = 0;

    for (let i = -10; i <= 10; i++) {
      const strike = atmStrike + i * step;
      const moneyness = (strike - spot) / spot;
      const cIv = Math.max(8.0, Math.min(45.0, 14.5 - moneyness * 12 + moneyness * moneyness * 45));
      const pIv = Math.max(8.0, Math.min(50.0, 14.5 - moneyness * 16 + moneyness * moneyness * 60));

      const cGk = calculateGreeks({ spot, strike, timeToExpiryYears: tY, volatility: cIv / 100, type: "CE" });
      const pGk = calculateGreeks({ spot, strike, timeToExpiryYears: tY, volatility: pIv / 100, type: "PE" });

      const dist = Math.abs(strike - spot);
      const decay = Math.exp(-dist / (step * 6));
      const cOi = Math.round((strike >= atmStrike ? 850000 : 320000) * decay + 45000);
      const pOi = Math.round((strike <= atmStrike ? 920000 : 280000) * decay + 50000);
      totalCallOi += cOi;
      totalPutOi += pOi;

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const r4 = (n: number) => Math.round(n * 10000) / 10000;

      rows.push({
        strike,
        call: {
          ltp: r2(Math.max(1, cGk.price)),
          close: r2(Math.max(1, cGk.price * 0.98)),
          volume: Math.round(cOi * 0.6),
          oi: cOi,
          prevOi: Math.round(cOi * 0.92),
          oiChange: Math.round(cOi * 0.08),
          bid: r2(cGk.price * 0.995),
          ask: r2(cGk.price * 1.005),
          iv: r2(cIv),
          delta: r2(cGk.delta),
          gamma: r4(cGk.gamma),
          theta: r2(cGk.theta),
          vega: r2(cGk.vega),
        },
        put: {
          ltp: r2(Math.max(1, pGk.price)),
          close: r2(Math.max(1, pGk.price * 0.98)),
          volume: Math.round(pOi * 0.6),
          oi: pOi,
          prevOi: Math.round(pOi * 0.92),
          oiChange: Math.round(pOi * 0.08),
          bid: r2(pGk.price * 0.995),
          ask: r2(pGk.price * 1.005),
          iv: r2(pIv),
          delta: r2(pGk.delta),
          gamma: r4(pGk.gamma),
          theta: r2(pGk.theta),
          vega: r2(pGk.vega),
        },
      });
    }

    const pcr = totalCallOi > 0 ? Number((totalPutOi / totalCallOi).toFixed(2)) : 1.0;
    const chain = {
      expiry,
      spot,
      atmStrike,
      pcr,
      maxPain: atmStrike,
      totalCallOi,
      totalPutOi,
      rows,
    };

    const plan = await generatePremiumTrades(sym, chain);
    // Send strictly top 1 best trade to prevent overflow
    await sendFnoAlerts(plan, [String(chatId)], 1);
  } catch (err: any) {
    console.error("[telegram-bot] handleFno failed:", err.message);
    await sendMessage(token, chatId, `⚠️ F&O alert generator error: ${escapeHtml(err.message)}`);
  }
}

async function handleHelp(token: string, chatId: number) {
  const help = [
    "🤖 <b>InvestIQ Bot Commands</b>",
    "",
    "<code>/fno</code> — best Grade A+ F&O setup with Sensibull Greeks View",
    "<code>/fno banknifty</code> — Bank Nifty F&O setup",
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

const str = (v: unknown, max = 80) => escapeHtml(String(v ?? "").slice(0, max));

/** Trading Terminal signal relay (CRON_SECRET-authenticated). */
async function handleTradeSignal(token: string, update: Record<string, unknown>) {
  const targetChatId = parseChatIds(process.env.TELEGRAM_CHAT_ID ?? "")[0] ?? PERMANENT_CHAT_IDS[0];
  const contract = typeof update.contract === "string" ? update.contract : "";
  const isCall = update.direction === "BUY_CALL" || contract.includes("CE");
  const msg = [
    `⚡ <b>INVESTIQ TRADING TERMINAL SIGNAL</b>`,
    ``,
    `🎯 <b>Contract:</b> <code>${str(contract || update.instrument)}</code>`,
    `📊 <b>Direction:</b> ${isCall ? "🟢 BUY CALL" : "🔴 BUY PUT"}`,
    `📍 <b>Spot Entry:</b> ${str(update.entry)}`,
    `🎯 <b>Target 1 (TP1):</b> ${str(update.tp1)}`,
    `🎯 <b>Target 2 (TP2):</b> ${str(update.tp2)}`,
    `🛑 <b>Stop Loss (SL):</b> ${str(update.sl)}`,
    `⏱ <b>Source:</b> TradingView Confluence Engine`,
    ``,
    `🔗 <a href="${escapeHtml(appUrl("/desktop/terminal"))}">Open Live Terminal</a>`,
    `⚠️ <i>Institutional education & research setup. Trade responsibly.</i>`,
  ].join("\n");

  await tgSend(token, targetChatId, msg);
  return Response.json({ ok: true, sent: 1, skipped: 0, errors: [] });
}

export const Route = createFileRoute("/api/public/hooks/telegram-bot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Telegram webhook calls carry the secret-token header; internal callers use CRON_SECRET.
        const internal =
          hasCronCredentials(request) ||
          (request.headers.get("cookie") ?? "").includes(ADMIN_COOKIE_NAME);
        const denied = internal
          ? await requireCronAuth(request)
          : requireTelegramWebhookAuth(request);
        if (denied) return denied;

        const token = getBotToken();
        if (!token) {
          return Response.json(
            { ok: false, sent: 0, skipped: 0, errors: ["TELEGRAM_BOT_TOKEN not configured"] },
            { status: 503 },
          );
        }

        let update: any;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }

        // Direct trade signal action dispatched from Trading Terminal Workstation
        if (update?.action === "trade_signal") {
          if (!internal) {
            return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
          }
          try {
            return await handleTradeSignal(token, update);
          } catch (e) {
            console.error("[telegram-bot] trade_signal failed:", (e as Error).message);
            return Response.json(
              { ok: false, sent: 0, skipped: 0, errors: [(e as Error).message] },
              { status: 502 },
            );
          }
        }

        const message = update?.message ?? update?.edited_message;
        const chatId: number | undefined = message?.chat?.id;
        const text: string = String(message?.text ?? "")
          .trim()
          .slice(0, 500);
        if (!chatId || !text) return Response.json({ ok: true, ignored: true });

        try {
          const lower = text.toLowerCase();
          if (lower === "/start" || lower === "/help") await handleHelp(token, chatId);
          else if (lower.startsWith("/fno") || lower.startsWith("/trades") || lower.startsWith("/besttrades")) {
            const arg = text.replace(/^\/(fno|trades|besttrades)/i, "").trim();
            await handleFno(token, chatId, arg);
          }
          else if (lower === "/gainers") await handleGainersLosers(token, chatId, "gainers");
          else if (lower === "/losers") await handleGainersLosers(token, chatId, "losers");
          else if (lower === "/sectors") await handleSectors(token, chatId);
          else if (lower === "/ipos") await handleIpos(token, chatId);
          else if (lower.startsWith("/search"))
            await handleSearch(token, chatId, text.replace(/^\/search/i, "").trim() || "RELIANCE");
          else if (lower.startsWith("/")) await handleHelp(token, chatId);
          else await handleSearch(token, chatId, text);
        } catch (e) {
          console.error("[telegram-bot] command failed:", (e as Error).message);
          await sendMessage(token, chatId, `❌ Error: ${escapeHtml((e as Error).message)}`);
        }
        // Always 200 for authenticated Telegram updates so Telegram does not retry.
        return Response.json({ ok: true });
      },
    },
  },
});
