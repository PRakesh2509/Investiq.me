/**
 * AI premium trade generator.
 *
 * Takes a live Upstox option chain, condenses it into a compact evidence pack
 * (spot, PCR, max pain, per-strike OI / IV / greeks around ATM) and asks the
 * Lovable AI Gateway for high-conviction option trades. Educational only.
 */

import type { AiTradePlan, PremiumTrade } from "./ai-trades";
export type { AiTradePlan, PremiumTrade };

const SYSTEM_PROMPT = `You are a senior Indian index/stock options derivatives strategist with 15+ years on an institutional F&O desk.
You are given a live option-chain snapshot (spot, PCR, max pain, and per-strike OI, change in OI, volume, LTP, bid/ask, IV and greeks around ATM).

Your job: identify the 2-4 highest-conviction ("premium") option trades available RIGHT NOW from this snapshot.

RULES
1. Use only the supplied data. Never invent strikes, prices or OI that are not in the snapshot.
2. Entry must be near the option's live LTP/ask (buy) or bid (sell). Target and stop must be realistic option premium levels, not index levels.
3. Every trade needs a reward:risk of at least 1.5. Reject ideas that do not clear it.
4. Rationale must cite specific evidence from the snapshot (OI build-up, unwinding, PCR, max pain, IV skew, delta/theta, volume).
5. Grade A+ only when OI, IV and price action all agree. Grade B is a scalp-quality idea.
6. Confidence is 40-90, derived from confluence count. Never claim certainty.
7. If the snapshot is inconclusive (thin volume, flat OI), return an empty trades array and explain why in marketView.

Return ONLY minified JSON, no markdown fences, matching exactly:
{"marketView":"","caution":"","trades":[{"rank":1,"grade":"A+","strategy":"","strike":0,"optionType":"CE","direction":"BUY","entry":0,"target":0,"stop":0,"rr":0,"confidence":0,"bias":"BULLISH","rationale":["","",""],"invalidation":""}]}
marketView: 1-2 sentences on the directional read from OI/PCR/max pain.
caution: one short risk line (educational only, not investment advice).`;

type Side = {
  ltp: number; close: number; volume: number; oi: number; prevOi: number; oiChange: number;
  bid: number; ask: number; iv: number; delta: number; gamma: number; theta: number; vega: number;
};
type Row = { strike: number; call: Side; put: Side };
type Chain = {
  expiry: string; spot: number; atmStrike: number; pcr: number; maxPain: number;
  totalCallOi: number; totalPutOi: number; rows: Row[];
};

function condense(chain: Chain, span = 8) {
  const idx = chain.rows.findIndex((r) => r.strike === chain.atmStrike);
  const slice = idx >= 0
    ? chain.rows.slice(Math.max(0, idx - span), idx + span + 1)
    : chain.rows.slice(0, span * 2 + 1);
  const r1 = (n: number) => Math.round(n * 100) / 100;
  return slice.map((r) => ({
    strike: r.strike,
    ce: {
      ltp: r1(r.call.ltp), bid: r1(r.call.bid), ask: r1(r.call.ask), oi: r.call.oi,
      oiChg: r.call.oiChange, vol: r.call.volume, iv: r1(r.call.iv),
      delta: r1(r.call.delta), theta: r1(r.call.theta),
    },
    pe: {
      ltp: r1(r.put.ltp), bid: r1(r.put.bid), ask: r1(r.put.ask), oi: r.put.oi,
      oiChg: r.put.oiChange, vol: r.put.volume, iv: r1(r.put.iv),
      delta: r1(r.put.delta), theta: r1(r.put.theta),
    },
  }));
}

const asNum = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function normalizeTrades(raw: unknown): PremiumTrade[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 4).map((t: any, i): PremiumTrade => {
    const entry = asNum(t?.entry);
    const target = asNum(t?.target);
    const stop = asNum(t?.stop);
    const risk = Math.abs(entry - stop);
    return {
      rank: asNum(t?.rank, i + 1),
      grade: (["A+", "A", "B"] as const).includes(t?.grade) ? t.grade : "A",
      strategy: String(t?.strategy ?? "Directional option buy").slice(0, 80),
      strike: asNum(t?.strike),
      optionType: t?.optionType === "PE" ? ("PE" as const) : ("CE" as const),
      direction: t?.direction === "SELL" ? ("SELL" as const) : ("BUY" as const),
      entry, target, stop,
      rr: risk ? Number((Math.abs(target - entry) / risk).toFixed(2)) : asNum(t?.rr),
      confidence: Math.max(40, Math.min(90, asNum(t?.confidence, 55))),
      bias: (["BULLISH", "BEARISH", "NEUTRAL"] as const).includes(t?.bias) ? (t.bias as PremiumTrade["bias"]) : ("NEUTRAL" as const),
      rationale: Array.isArray(t?.rationale) ? t.rationale.slice(0, 5).map((s: unknown) => String(s)) : [],
      invalidation: String(t?.invalidation ?? "Exit if premium closes below stop on 15m candle."),
    };
  }).filter((t) => t.strike > 0 && t.entry > 0);
}

export async function generatePremiumTrades(
  symbol: string,
  chain: Chain,
): Promise<AiTradePlan> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const key = geminiKey || lovableKey;
  if (!key) throw new Error("GEMINI_API_KEY or LOVABLE_API_KEY is not configured");

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

  const endpoint = geminiKey
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (geminiKey) {
    headers["Authorization"] = `Bearer ${geminiKey}`;
  } else {
    headers["Lovable-API-Key"] = lovableKey!;
  }

  const model = geminiKey ? "gemini-3.8-flash" : "google/gemini-3.6-flash";

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(pack) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted — top up credits to continue.");
    throw new Error(`AI gateway ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(String(content).replace(/^```json\s*|```$/g, "").trim());
  } catch {
    parsed = {};
  }

  return {
    symbol,
    expiry: chain.expiry,
    spot: chain.spot,
    pcr: chain.pcr,
    maxPain: chain.maxPain,
    marketView: String(parsed?.marketView ?? "AI could not form a clear view from this snapshot."),
    caution: String(parsed?.caution ?? "Educational only — not investment advice."),
    trades: normalizeTrades(parsed?.trades),
    generatedAt: Date.now(),
  };
}

/* ------------------------------ Telegram fan-out ----------------------------- */

const PERMANENT_CHAT_IDS = [
  "7350570004",
  "5589831995",
  "1840901163",
  "1360613728",
  "8155139346",
  "6799336293",
  "7280324188",
  "6698697147",
];

function getRecipients(): string[] {
  const envIds = (process.env["TELEGRAM_CHAT_ID"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));
}

const inr = (v: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildTradeMessage(plan: AiTradePlan) {
  const L: string[] = [];
  L.push(`<b>💎 ${plan.symbol.toUpperCase()}</b>`);
  L.push("━━━━━━━━━━━━━━━━━━");
  L.push("");
  L.push(`<b>${plan.symbol} · ${plan.expiry}</b>`);
  L.push(`Spot      : ₹${inr(plan.spot)}`);
  L.push(`PCR (OI)  : ${plan.pcr.toFixed(2)}`);
  L.push(`Max Pain  : ${plan.maxPain}`);
  L.push("");
  L.push(`<i>${plan.marketView}</i>`);
  L.push("");

  if (!plan.trades.length) {
    L.push("No high-conviction setup right now.");
  }

  for (const t of plan.trades) {
    L.push("──────────────────");
    L.push("");
    L.push(`<b>#${t.rank} ${t.grade} · ${t.direction} ${t.strike} ${t.optionType}</b>`);
    L.push(`Strategy  : ${t.strategy}`);
    L.push(`Bias      : ${t.bias}`);
    L.push(`Entry     : ₹${inr(t.entry)}`);
    L.push(`Target    : ₹${inr(t.target)}`);
    L.push(`Stop      : ₹${inr(t.stop)}`);
    L.push(`R:R       : ${t.rr.toFixed(2)}   ·   Confidence : ${t.confidence}%`);
    if (t.rationale.length) {
      L.push("");
      for (const r of t.rationale.slice(0, 3)) L.push(`• ${r}`);
    }
    L.push("");
    L.push(`⛔ ${t.invalidation}`);
    L.push("");
  }

  L.push("━━━━━━━━━━━━━━━━━━");
  L.push(`⚠️ ${plan.caution}`);
  L.push(
    `<i>${new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16)} IST · InvestIQ Terminal</i>`,
  );
  return L.join("\n");
}

export async function sendPremiumTrades(plan: AiTradePlan) {
  const token = process.env["TELEGRAM_BOT_TOKEN"] || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
  const chatIds = getRecipients();
  const text = buildTradeMessage(plan);
  let sent = 0;
  for (const chatId of chatIds) {
    try {
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
      const json = (await res.json()) as { ok: boolean };
      if (json.ok) sent += 1;
    } catch (e) {
      console.error("[ai-trades] telegram", chatId, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { sent, total: CHAT_IDS.length };
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

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  L.push(padRow(` R:R   ${meter(t.rr, 4)}  ${t.rr.toFixed(1)}x`));
  L.push(padRow(` Conf  ${meter(t.confidence, 100)}  ${Math.round(t.confidence / 10)}/10`));
  L.push("╚" + "═".repeat(CARD_W) + "╝");

  const time = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
  const body = [
    `<pre>${esc(L.join("\n"))}</pre>`,
    `<b>${esc(t.strike + " " + t.optionType)} · ${esc(t.strategy)}</b>`,
    `Expiry ${esc(plan.expiry)} · Spot ₹${inr(plan.spot)} · PCR ${plan.pcr.toFixed(2)}`,
  ];
  if (t.rationale.length) {
    body.push("");
    body.push(`🔍 <b>Why:</b> ${esc(t.rationale.slice(0, 3).join(" + "))}`);
  }

  body.push("");
  body.push(`⛔ ${esc(t.invalidation)}`);
  body.push(`🕐 <i>${time} IST · ${esc(plan.symbol.toUpperCase())} · ${t.grade} confluence</i>`);
  return body.join("\n");
}

const FNO_BUTTON = {
  inline_keyboard: [
    [
      {
        text: "📊 F&O Alerts",
        url: "https://exact-view-enchant.lovable.app/desktop/option-chain",
      },
    ],
  ],
};

/**
 * Sends F&O alert cards with an F&O Alerts button.
 * `limit` caps how many trades are sent (default 1 — one click, one trade).
 */
export async function sendFnoAlerts(
  plan: AiTradePlan,
  chatIds: string[] = getRecipients(),
  limit = 1,
) {
  const token = process.env["TELEGRAM_BOT_TOKEN"] || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
  const picked = [...plan.trades]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.rank - b.rank)
    .slice(0, Math.max(1, limit));
  const cards = picked.length
    ? picked.map((t) => buildFnoCard(plan, t))
    : [
        `<b>💎 ${esc(plan.symbol.toUpperCase())}</b>\nNo high-conviction F&amp;O setup right now.\n<i>${esc(plan.marketView)}</i>`,
      ];

  let sent = 0;
  for (const chatId of chatIds) {
    for (const text of cards) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: FNO_BUTTON,
          }),
        });
        const json = (await res.json()) as { ok: boolean; description?: string };
        if (json.ok) sent += 1;
        else console.error("[fno-alert] telegram", chatId, json.description);
      } catch (e) {
        console.error("[fno-alert] telegram", chatId, (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return { sent, total: chatIds.length * cards.length, cards: cards.length };
}
