import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const geminiKey = process.env.GEMINI_API_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatIds = (process.env.TELEGRAM_CHAT_ID || "7350570004").split(",").map(s => s.trim()).filter(Boolean);

console.log("Testing F&O Card generation with Gemini 3.8 Flash...");

// Option chain data for Bank Nifty
const pack = {
  symbol: "BANKNIFTY",
  expiry: "28-OCT-2026",
  spot: 52450.0,
  atmStrike: 52500,
  pcr: 1.28,
  maxPain: 52400,
  totalCallOi: 18500000,
  totalPutOi: 23600000,
  istTime: new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16),
  strikes: [
    {
      strike: 52200,
      ce: { ltp: 490, bid: 488, ask: 492, oi: 850000, oiChg: -120000, vol: 450000, iv: 14.2, delta: 0.65, theta: -24 },
      pe: { ltp: 185, bid: 183, ask: 187, oi: 2100000, oiChg: 450000, vol: 780000, iv: 15.1, delta: -0.35, theta: -19 },
    },
    {
      strike: 52300,
      ce: { ltp: 410, bid: 408, ask: 412, oi: 920000, oiChg: -85000, vol: 560000, iv: 14.0, delta: 0.59, theta: -25 },
      pe: { ltp: 225, bid: 223, ask: 227, oi: 2400000, oiChg: 520000, vol: 920000, iv: 14.8, delta: -0.41, theta: -21 },
    },
    {
      strike: 52400,
      ce: { ltp: 335, bid: 333, ask: 337, oi: 1450000, oiChg: -50000, vol: 890000, iv: 13.8, delta: 0.53, theta: -26 },
      pe: { ltp: 275, bid: 273, ask: 277, oi: 3100000, oiChg: 680000, vol: 1250000, iv: 14.6, delta: -0.47, theta: -23 },
    },
    {
      strike: 52500,
      ce: { ltp: 270, bid: 268, ask: 272, oi: 2900000, oiChg: 150000, vol: 1550000, iv: 13.6, delta: 0.47, theta: -26 },
      pe: { ltp: 330, bid: 328, ask: 332, oi: 2800000, oiChg: 490000, vol: 1400000, iv: 14.4, delta: -0.53, theta: -24 },
    },
    {
      strike: 52600,
      ce: { ltp: 215, bid: 213, ask: 217, oi: 3400000, oiChg: 410000, vol: 1350000, iv: 13.5, delta: 0.40, theta: -25 },
      pe: { ltp: 405, bid: 402, ask: 408, oi: 1450000, oiChg: 110000, vol: 620000, iv: 14.7, delta: -0.60, theta: -22 },
    },
  ],
};

const SYSTEM_PROMPT = `You are a senior Indian index/stock options derivatives strategist with 15+ years on an institutional F&O desk.
You are given a live option-chain snapshot (spot, PCR, max pain, and per-strike OI, change in OI, volume, LTP, bid/ask, IV and greeks around ATM).
Your job: identify the 2-4 highest-conviction ("premium") option trades available RIGHT NOW from this snapshot.
RULES:
1. Use only the supplied data.
2. Every trade needs a reward:risk of at least 1.5.
3. Grade A+ only when OI, IV and price action all agree.
Return ONLY minified JSON:
{"marketView":"","caution":"","trades":[{"rank":1,"grade":"A+","strategy":"","strike":0,"optionType":"CE","direction":"BUY","entry":0,"target":0,"stop":0,"rr":0,"confidence":0,"bias":"BULLISH","rationale":["","",""],"invalidation":""}]}`;

const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${geminiKey}`,
  },
  body: JSON.stringify({
    model: "gemini-3.8-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(pack) },
    ],
    response_format: { type: "json_object" },
  }),
});

const geminiJson = await geminiRes.json();
const parsed = JSON.parse(geminiJson.choices[0].message.content.replace(/^```json\s*|```$/g, "").trim());

console.log("Gemini Generated Market View:", parsed.marketView);
console.log("Trades Generated:", parsed.trades.length);

const CARD_W = 31;
function padRow(inner) {
  const visible = [...inner].length;
  return `║${inner}${" ".repeat(Math.max(0, CARD_W - visible))}║`;
}
function meter(value, max, cells = 6) {
  const filled = Math.max(0, Math.min(cells, Math.round((value / max) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inr = (v) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const t = parsed.trades[0];
const side = t.bias === "BEARISH" ? "SHORT" : t.bias === "BULLISH" ? "LONG" : t.direction;
const icon = side === "SHORT" ? "📉" : "📈";
const head = ` 💎  BANKNIFTY   ${t.grade}   ${side} ${icon} `;

const L = [];
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
  `Expiry ${esc(pack.expiry)} · Spot ₹${inr(pack.spot)} · PCR ${pack.pcr.toFixed(2)}`,
];
if (t.rationale.length) {
  body.push("");
  body.push(`🔍 <b>Why:</b> ${esc(t.rationale.slice(0, 3).join(" + "))}`);
}
body.push("");
body.push(`⛔ ${esc(t.invalidation)}`);
body.push(`🕐 <i>${time} IST · BANKNIFTY · ${t.grade} confluence · Powered by Gemini</i>`);
const cardText = body.join("\n");

console.log("\nDispatching Boxed F&O Alert Card to Telegram...");
for (const cid of chatIds) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cid,
        text: cardText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📊 F&O Alerts", url: "https://www.investiqq.me/desktop/terminal" }],
          ],
        },
      }),
    });
    const j = await res.json();
    if (j.ok) console.log(`[F&O Alert] Successfully sent to ${cid}`);
  } catch (e) {
    console.error(`[F&O Alert] Error sending to ${cid}:`, e.message);
  }
}
