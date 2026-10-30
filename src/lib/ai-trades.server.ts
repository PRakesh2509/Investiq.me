/**
 * AI premium trade generator.
 *
 * Takes a live Upstox option chain, condenses it into a compact evidence pack
 * (spot, PCR, max pain, per-strike OI / IV / greeks around ATM) and asks the
 * Lovable AI Gateway for high-conviction option trades. Educational only.
 */

import type { AiTradePlan, PremiumTrade } from "./ai-trades.ts";
import { appUrl } from "./app-url.ts";
import { escapeHtml, getBotToken, resolveChatIds, sendToMany } from "./telegram.server.ts";
export type { AiTradePlan, PremiumTrade };

const SYSTEM_PROMPT = `You are a senior institutional Indian index F&O derivatives strategist and quantitative risk manager specializing in Sensibull Greeks View analytics.
You are given a live option-chain snapshot (spot, PCR, max pain, ATM strike, per-strike OI, change in OI, volume, LTP, bid/ask, IV and Black-Scholes Greeks: Delta, Gamma, Theta, Vega).

Your job: identify strictly the single best (at most 2) highest-conviction ("premium" Grade A+) option trade setup available RIGHT NOW from this snapshot. Do NOT generate low-quality trades or overflow the portfolio.

RULES:
1. Strict Quality Filter: Only provide high-conviction Grade A+ setups with Reward:Risk >= 1.5x. Never overflow trades (limit to 1-2 ideas max).
2. Sensibull Greeks View Analysis:
   - Delta (Δ): Cite option Delta (e.g. +0.48 to +0.58 for ATM/near-the-money buys).
   - Gamma (Γ): Note gamma acceleration & peak gamma strike.
   - Theta (Θ): Account for time decay (₹/day) to ensure favorable holding horizon.
   - Vega (V): Assess sensitivity to volatility expansion/crush.
   - IV & Skew: Compare Call IV vs Put IV relative to India VIX.
   - OI Walls: Identify major Call OI (resistance) and Put OI (support) strikes.
3. Entry must be near the option's live LTP. Target and stop loss must be realistic option premium levels (₹).
4. Invalidation: Define a hard index spot level or technical exit rule.

Return ONLY minified JSON, no markdown fences, matching exactly:
{"marketView":"","caution":"","trades":[{"rank":1,"grade":"A+","strategy":"","strike":0,"optionType":"CE","direction":"BUY","entry":0,"target":0,"stop":0,"rr":0,"confidence":0,"bias":"BULLISH","delta":0.5,"gamma":0.002,"theta":-12.5,"vega":8.5,"iv":15.2,"oiResistance":23200,"oiSupport":22800,"rationale":["","",""],"invalidation":""}]}
marketView: 1-2 sentences on the directional read from OI/PCR/max pain and Greeks.
caution: one short risk line (educational only, not investment advice).`;

type Side = {
  ltp: number;
  close: number;
  volume: number;
  oi: number;
  prevOi: number;
  oiChange: number;
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};
type Row = { strike: number; call: Side; put: Side };
type Chain = {
  expiry: string;
  spot: number;
  atmStrike: number;
  pcr: number;
  maxPain: number;
  totalCallOi: number;
  totalPutOi: number;
  rows: Row[];
};

function condense(chain: Chain, span = 8) {
  const idx = chain.rows.findIndex((r) => r.strike === chain.atmStrike);
  const slice =
    idx >= 0
      ? chain.rows.slice(Math.max(0, idx - span), idx + span + 1)
      : chain.rows.slice(0, span * 2 + 1);
  const r1 = (n: number) => Math.round(n * 100) / 100;
  return slice.map((r) => ({
    strike: r.strike,
    ce: {
      ltp: r1(r.call.ltp),
      bid: r1(r.call.bid),
      ask: r1(r.call.ask),
      oi: r.call.oi,
      oiChg: r.call.oiChange,
      vol: r.call.volume,
      iv: r1(r.call.iv),
      delta: r1(r.call.delta),
      theta: r1(r.call.theta),
    },
    pe: {
      ltp: r1(r.put.ltp),
      bid: r1(r.put.bid),
      ask: r1(r.put.ask),
      oi: r.put.oi,
      oiChg: r.put.oiChange,
      vol: r.put.volume,
      iv: r1(r.put.iv),
      delta: r1(r.put.delta),
      theta: r1(r.put.theta),
    },
  }));
}

const asNum = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function normalizeTrades(raw: unknown, chain?: Chain): PremiumTrade[] {
  if (!Array.isArray(raw)) return [];

  // Identify institutional OI walls from the option chain
  let callWall = 0;
  let putWall = 0;
  if (chain?.rows?.length) {
    let maxC = -1;
    let maxP = -1;
    for (const r of chain.rows) {
      if (r.call.oi > maxC) {
        maxC = r.call.oi;
        callWall = r.strike;
      }
      if (r.put.oi > maxP) {
        maxP = r.put.oi;
        putWall = r.strike;
      }
    }
  }

  return raw
    .slice(0, 2) // Never overflow: cap strictly to top 1-2 highest conviction setups
    .map((t: any, i): PremiumTrade => {
      const entry = asNum(t?.entry);
      const target = asNum(t?.target);
      const stop = asNum(t?.stop);
      const risk = Math.abs(entry - stop);
      const strike = asNum(t?.strike);
      const optionType = t?.optionType === "PE" ? ("PE" as const) : ("CE" as const);

      let delta = typeof t?.delta === "number" ? t.delta : undefined;
      let gamma = typeof t?.gamma === "number" ? t.gamma : undefined;
      let theta = typeof t?.theta === "number" ? t.theta : undefined;
      let vega = typeof t?.vega === "number" ? t.vega : undefined;
      let iv = typeof t?.iv === "number" ? t.iv : undefined;

      // Calibrate with mathematical Greeks from chain if missing
      if (chain?.rows) {
        const row = chain.rows.find((r) => r.strike === strike);
        if (row) {
          const side = optionType === "PE" ? row.put : row.call;
          if (delta === undefined && typeof side.delta === "number") delta = side.delta;
          if (gamma === undefined && typeof side.gamma === "number") gamma = side.gamma;
          if (theta === undefined && typeof side.theta === "number") theta = side.theta;
          if (vega === undefined && typeof side.vega === "number") vega = side.vega;
          if (iv === undefined && typeof side.iv === "number") iv = side.iv;
        }
      }

      return {
        rank: asNum(t?.rank, i + 1),
        grade: (["A+", "A", "B"] as const).includes(t?.grade) ? t.grade : "A+",
        strategy: String(t?.strategy ?? "Directional option buy").slice(0, 80),
        strike,
        optionType,
        direction: t?.direction === "SELL" ? ("SELL" as const) : ("BUY" as const),
        entry,
        target,
        stop,
        rr: risk ? Number((Math.abs(target - entry) / risk).toFixed(2)) : asNum(t?.rr, 1.8),
        confidence: Math.max(40, Math.min(95, asNum(t?.confidence, 80))),
        bias: (["BULLISH", "BEARISH", "NEUTRAL"] as const).includes(t?.bias)
          ? (t.bias as PremiumTrade["bias"])
          : ("BULLISH" as const),
        rationale: Array.isArray(t?.rationale)
          ? t.rationale.slice(0, 5).map((s: unknown) => String(s))
          : [],
        invalidation: String(t?.invalidation ?? "Exit if premium closes below stop on 15m candle."),
        delta,
        gamma,
        theta,
        vega,
        iv,
        oiResistance: typeof t?.oiResistance === "number" ? t.oiResistance : (callWall || undefined),
        oiSupport: typeof t?.oiSupport === "number" ? t.oiSupport : (putWall || undefined),
      };
    })
    .filter((t) => t.strike > 0 && t.entry > 0);
}

export async function generatePremiumTrades(symbol: string, chain: Chain): Promise<AiTradePlan> {
  const clean = (v: string | undefined) => (v ? v.replace(/^["']|["']$/g, "").trim() : "");
  const geminiKey = clean(process.env["GEMINI_API_KEY"]);
  const lovableKey = clean(process.env["LOVABLE_API_KEY"]);
  if (!geminiKey && !lovableKey) {
    throw new Error("GEMINI_API_KEY (or fallback LOVABLE_API_KEY) is not configured");
  }

  const pack = {
    symbol,
    expiry: chain.expiry,
    spot: chain.spot,
    atmStrike: chain.atmStrike,
    pcr: chain.pcr,
    maxPain: chain.maxPain,
    totalCallOi: chain.totalCallOi,
    totalPutOi: chain.totalPutOi,
    istTime: new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16),
    strikes: condense(chain),
  };

  // Direct Gemini first; the Lovable gateway is only a fallback when Gemini is
  // unconfigured or fails.
  const providers: {
    name: string;
    endpoint: string;
    headers: Record<string, string>;
    model: string;
  }[] = [];
  if (geminiKey) {
    providers.push({
      name: "Gemini 3.5 Flash",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiKey}` },
      model: "gemini-3.5-flash",
    });
    providers.push({
      name: "Gemini 3.5 Flash Lite",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiKey}` },
      model: "gemini-3.5-flash-lite",
    });
    providers.push({
      name: "Gemini 3.6 Flash",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiKey}` },
      model: "gemini-3.6-flash",
    });
  }
  if (lovableKey) {
    providers.push({
      name: "Lovable gateway",
      endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      model: "google/gemini-3.6-flash",
    });
  }

  const baseBody = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(pack) },
    ],
    response_format: { type: "json_object" },
  };

  let json: any = null;
  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({ model: provider.model, ...baseBody }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute.");
        if (res.status === 402)
          throw new Error("AI credits exhausted — top up credits to continue.");
        throw new Error(`${provider.name} ${res.status}: ${detail.slice(0, 200)}`);
      }
      json = await res.json();
      break;
    } catch (e) {
      lastError = e as Error;
      console.warn(`[ai-trades] ${provider.name} failed:`, lastError.message);
    }
  }
  if (!json) throw lastError ?? new Error("AI request failed");

  const content = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(
      String(content)
        .replace(/^```json\s*|```$/g, "")
        .trim(),
    );
  } catch {
    parsed = {};
  }

  // Calculate support and resistance walls
  let callWall = 0;
  let putWall = 0;
  if (chain.rows?.length) {
    let maxC = -1;
    let maxP = -1;
    for (const r of chain.rows) {
      if (r.call.oi > maxC) {
        maxC = r.call.oi;
        callWall = r.strike;
      }
      if (r.put.oi > maxP) {
        maxP = r.put.oi;
        putWall = r.strike;
      }
    }
  }

  const atmRow = chain.rows.find((r) => r.strike === chain.atmStrike);
  const atmIv = atmRow ? (atmRow.call.iv + atmRow.put.iv) / 2 : undefined;

  return {
    symbol,
    expiry: chain.expiry,
    spot: chain.spot,
    pcr: chain.pcr,
    maxPain: chain.maxPain,
    atmStrike: chain.atmStrike,
    atmIv: atmIv ? Number(atmIv.toFixed(1)) : undefined,
    oiResistanceWall: callWall || undefined,
    oiSupportWall: putWall || undefined,
    marketView: String(parsed?.marketView ?? "AI could not form a clear view from this snapshot."),
    caution: String(parsed?.caution ?? "Educational only — not investment advice."),
    trades: normalizeTrades(parsed?.trades, chain),
    generatedAt: Date.now(),
  };
}

/* ------------------------------ Telegram fan-out ----------------------------- */

function getRecipients(): string[] {
  return resolveChatIds();
}

const inr = (v: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildTradeMessage(plan: AiTradePlan) {
  const L: string[] = [];
  L.push(`<b>💎 ${escapeHtml(plan.symbol.toUpperCase())}</b>`);
  L.push("━━━━━━━━━━━━━━━━━━");
  L.push("");
  L.push(`<b>${escapeHtml(plan.symbol)} · ${escapeHtml(plan.expiry)}</b>`);
  L.push(`Spot      : ₹${inr(plan.spot)}`);
  L.push(`PCR (OI)  : ${plan.pcr.toFixed(2)}`);
  L.push(`Max Pain  : ${plan.maxPain}`);
  L.push("");
  L.push(`<i>${escapeHtml(plan.marketView)}</i>`);
  L.push("");

  if (!plan.trades.length) {
    L.push("No high-conviction setup right now.");
  }

  for (const t of plan.trades) {
    L.push("──────────────────");
    L.push("");
    L.push(`<b>#${t.rank} ${t.grade} · ${t.direction} ${t.strike} ${t.optionType}</b>`);
    L.push(`Strategy  : ${escapeHtml(t.strategy)}`);
    L.push(`Bias      : ${t.bias}`);
    L.push(`Entry     : ₹${inr(t.entry)}`);
    L.push(`Target    : ₹${inr(t.target)}`);
    L.push(`Stop      : ₹${inr(t.stop)}`);
    L.push(`R:R       : ${t.rr.toFixed(2)}   ·   Confidence : ${t.confidence}%`);
    if (t.rationale.length) {
      L.push("");
      for (const r of t.rationale.slice(0, 3)) L.push(`• ${escapeHtml(r)}`);
    }
    L.push("");
    L.push(`⛔ ${escapeHtml(t.invalidation)}`);
    L.push("");
  }

  L.push("━━━━━━━━━━━━━━━━━━");
  L.push(`⚠️ ${escapeHtml(plan.caution)}`);
  L.push(
    `<i>${new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16)} IST · InvestIQ Terminal</i>`,
  );
  return L.join("\n");
}

export async function sendPremiumTrades(plan: AiTradePlan, chatIds: string[] = getRecipients()) {
  const token = getBotToken();
  if (!token) {
    console.error("[ai-trades] TELEGRAM_BOT_TOKEN is not configured; nothing sent");
    return { sent: 0, total: chatIds.length };
  }
  const res = await sendToMany(token, chatIds, buildTradeMessage(plan), { delayMs: 250 });
  for (const err of res.errors) console.error("[ai-trades] telegram", err);
  return { sent: res.delivered, total: chatIds.length };
}

/* ------------------------- F&O alert cards (boxed style) ------------------------ */

const CARD_W = 31; // inner width of the box

function padRow(inner: string) {
  const visible = [...inner].length;
  return `║${inner}${" ".repeat(Math.max(0, CARD_W - visible))}║`;
}

function meter(value: number, max: number, cells = 6) {
  const filled = Math.max(0, Math.min(cells, Math.round((value / max) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Renders one trade as a monospace card, like the F&O alert design. */
export function buildFnoCard(plan: AiTradePlan, t: PremiumTrade) {
  const side = t.bias === "BEARISH" ? "SHORT" : t.bias === "BULLISH" ? "LONG" : t.direction;
  const icon = side === "SHORT" ? "📉" : "📈";
  const head = ` 💎  ${plan.symbol.toUpperCase()}   ${t.grade}   ${side} ${icon} `;
  const L: string[] = [];
  L.push("╔" + "═".repeat(CARD_W) + "╗");
  L.push(padRow(head.slice(0, CARD_W)));
  L.push("╠" + "═".repeat(CARD_W) + "╣");
  L.push(padRow(` Entry : ${inr(t.entry).padStart(12)}`));
  L.push(padRow(` TP    : ${inr(t.target).padStart(12)}`));
  L.push(padRow(` SL    : ${inr(t.stop).padStart(12)}`));
  L.push(padRow(""));
  const conf7 = Math.max(1, Math.min(7, Math.round((t.confidence / 100) * 7)));
  L.push(padRow(` R:R   ${meter(t.rr, 4)}  ${t.rr.toFixed(1)}x`));
  L.push(padRow(` Conf  ${meter(conf7, 7, 7)}  ${conf7}/7`));
  L.push("╚" + "═".repeat(CARD_W) + "╝");

  const time = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
  const body = [
    `<pre>${esc(L.join("\n"))}</pre>`,
    `<b>${esc(t.strike + " " + t.optionType)} · ${esc(t.strategy)}</b>`,
    `Expiry ${esc(plan.expiry)} · Spot ₹${inr(plan.spot)} · PCR ${plan.pcr.toFixed(2)} · Max Pain ${plan.maxPain}`,
  ];

  // Sensibull Greeks View Breakdown
  const greeksLines: string[] = [];
  if (t.delta !== undefined) greeksLines.push(`• <b>Delta (Δ):</b> ${t.delta > 0 ? "+" : ""}${t.delta.toFixed(2)}`);
  if (t.gamma !== undefined) greeksLines.push(`• <b>Gamma (Γ):</b> ${t.gamma.toFixed(4)}`);
  if (t.theta !== undefined) greeksLines.push(`• <b>Theta (Θ):</b> ₹${t.theta.toFixed(1)}/day decay`);
  if (t.vega !== undefined) greeksLines.push(`• <b>Vega (V):</b> +₹${t.vega.toFixed(1)}/1% IV`);
  if (t.iv !== undefined) greeksLines.push(`• <b>IV:</b> ${t.iv.toFixed(1)}%`);
  if (t.oiSupport || t.oiResistance) {
    greeksLines.push(`• <b>OI Walls:</b> Support ₹${inr(t.oiSupport ?? 0)} · Resist ₹${inr(t.oiResistance ?? 0)}`);
  }

  if (greeksLines.length) {
    body.push("");
    body.push(`⚡ <b>SENSIBULL GREEKS VIEW</b>`);
    body.push(greeksLines.join("\n"));
  }

  if (t.rationale.length) {
    body.push("");
    body.push(`🔍 <b>Confluence:</b> ${esc(t.rationale.slice(0, 5).join(" • "))}`);
  }

  body.push("");
  body.push(`⛔ <b>Invalidation:</b> ${esc(t.invalidation)}`);
  body.push(`🕐 <i>${time} IST · ${esc(plan.symbol.toUpperCase())} · ${t.grade} institutional setup</i>`);
  return body.join("\n");
}

/** Inline keyboard linking back to the option chain (built per call so appUrl() reads current env). */
function fnoButton() {
  return {
    inline_keyboard: [[{ text: "📊 F&O Alerts", url: appUrl("/desktop/option-chain") }]],
  };
}

/**
 * Sends F&O alert cards with an F&O Alerts button.
 * `limit` caps how many trades are sent (default 1 — one click, one trade).
 */
export async function sendFnoAlerts(
  plan: AiTradePlan,
  chatIds: string[] = getRecipients(),
  limit = 1,
) {
  const token = getBotToken();
  const picked = [...plan.trades]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.rank - b.rank)
    .slice(0, Math.max(1, limit));
  const cards = picked.length
    ? picked.map((t) => buildFnoCard(plan, t))
    : [
        `<b>💎 ${esc(plan.symbol.toUpperCase())}</b>
No high-conviction F&amp;O setup right now.
<i>${esc(plan.marketView)}</i>`,
      ];
  const total = chatIds.length * cards.length;
  if (!token) {
    console.error("[fno-alert] TELEGRAM_BOT_TOKEN is not configured; nothing sent");
    return { sent: 0, total, cards: cards.length };
  }

  let sent = 0;
  const markup = fnoButton();
  for (const text of cards) {
    const res = await sendToMany(token, chatIds, text, { delayMs: 250, replyMarkup: markup });
    sent += res.delivered;
    for (const err of res.errors) console.error("[fno-alert] telegram", err);
  }
  return { sent, total, cards: cards.length };
}
