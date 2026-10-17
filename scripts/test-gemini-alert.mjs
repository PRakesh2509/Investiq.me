import fs from "fs";
import path from "path";

// 1. Load .env manually if not in process.env
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
const chatIds = (process.env.TELEGRAM_CHAT_ID || "7350570004")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log("Using Gemini API Key:", geminiKey ? `${geminiKey.slice(0, 8)}...${geminiKey.slice(-6)}` : "MISSING");
console.log("Using Telegram Bot Token:", botToken ? `${botToken.slice(0, 10)}...` : "MISSING");
console.log("Target Chat IDs:", chatIds);

// 2. Prepare synthetic or live NIFTY option chain evidence pack
const spot = 24850.5;
const atmStrike = 24850;
const expiry = "24-OCT-2026";
const pcr = 1.15;
const maxPain = 24800;

const strikes = [
  {
    strike: 24700,
    ce: { ltp: 220.5, bid: 219.0, ask: 221.5, oi: 2850000, oiChg: -450000, vol: 920000, iv: 12.8, delta: 0.68, theta: -14.2 },
    pe: { ltp: 58.2, bid: 57.5, ask: 58.8, oi: 4200000, oiChg: 850000, vol: 1450000, iv: 13.9, delta: -0.32, theta: -10.5 },
  },
  {
    strike: 24750,
    ce: { ltp: 178.0, bid: 177.0, ask: 179.0, oi: 2100000, oiChg: -320000, vol: 1100000, iv: 12.5, delta: 0.61, theta: -15.1 },
    pe: { ltp: 76.5, bid: 75.8, ask: 77.2, oi: 3800000, oiChg: 620000, vol: 1600000, iv: 13.5, delta: -0.39, theta: -11.8 },
  },
  {
    strike: 24800,
    ce: { ltp: 140.5, bid: 139.8, ask: 141.2, oi: 3950000, oiChg: -150000, vol: 2400000, iv: 12.2, delta: 0.54, theta: -16.0 },
    pe: { ltp: 98.0, bid: 97.2, ask: 98.8, oi: 5100000, oiChg: 1150000, vol: 2800000, iv: 13.2, delta: -0.46, theta: -13.2 },
  },
  {
    strike: 24850,
    ce: { ltp: 108.0, bid: 107.5, ask: 108.5, oi: 4800000, oiChg: 210000, vol: 3100000, iv: 12.0, delta: 0.47, theta: -16.5 },
    pe: { ltp: 124.5, bid: 123.8, ask: 125.2, oi: 4400000, oiChg: 890000, vol: 2950000, iv: 13.0, delta: -0.53, theta: -14.1 },
  },
  {
    strike: 24900,
    ce: { ltp: 81.0, bid: 80.2, ask: 81.8, oi: 6200000, oiChg: 950000, vol: 3400000, iv: 11.9, delta: 0.40, theta: -16.2 },
    pe: { ltp: 156.0, bid: 155.0, ask: 157.0, oi: 2900000, oiChg: 310000, vol: 1800000, iv: 13.1, delta: -0.60, theta: -14.8 },
  },
  {
    strike: 24950,
    ce: { ltp: 59.5, bid: 59.0, ask: 60.0, oi: 4100000, oiChg: 780000, vol: 2100000, iv: 11.8, delta: 0.33, theta: -15.4 },
    pe: { ltp: 192.0, bid: 190.5, ask: 193.0, oi: 1850000, oiChg: 120000, vol: 1200000, iv: 13.4, delta: -0.67, theta: -15.2 },
  },
  {
    strike: 25000,
    ce: { ltp: 42.0, bid: 41.5, ask: 42.5, oi: 8900000, oiChg: 1850000, vol: 4800000, iv: 11.7, delta: 0.26, theta: -14.1 },
    pe: { ltp: 232.0, bid: 230.5, ask: 233.5, oi: 1200000, oiChg: -80000, vol: 850000, iv: 13.8, delta: -0.74, theta: -15.0 },
  },
];

const pack = {
  symbol: "NIFTY 50",
  expiry,
  spot,
  atmStrike,
  pcr,
  maxPain,
  totalCallOi: 32000000,
  totalPutOi: 36800000,
  istTime: new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16),
  strikes,
};

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

console.log("\nCalling Gemini 3.8 Flash via OpenAI-compatible endpoint...");
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

if (!geminiRes.ok) {
  const errText = await geminiRes.text();
  console.error("Gemini API error:", geminiRes.status, errText);
  process.exit(1);
}

const geminiJson = await geminiRes.json();
const content = geminiJson.choices?.[0]?.message?.content ?? "{}";
console.log("\nGemini Response received successfully!");
console.log("Raw Response Preview:", content.slice(0, 200) + "...");

let parsed;
try {
  parsed = JSON.parse(content.replace(/^```json\s*|```$/g, "").trim());
} catch (e) {
  console.error("Failed to parse JSON:", e);
  process.exit(1);
}

const inr = (v) =>
  Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildTradeMessage(plan) {
  const L = [];
  L.push(`<b>💎 ${plan.symbol.toUpperCase()} — AI CONFLUENCE ALERT</b>`);
  L.push("━━━━━━━━━━━━━━━━━━");
  L.push("");
  L.push(`<b>${plan.symbol} · Expiry: ${plan.expiry}</b>`);
  L.push(`Spot      : ₹${inr(plan.spot)}`);
  L.push(`PCR (OI)  : ${plan.pcr.toFixed(2)}`);
  L.push(`Max Pain  : ${plan.maxPain}`);
  L.push("");
  L.push(`<i>${plan.marketView}</i>`);
  L.push("");

  if (!plan.trades || !plan.trades.length) {
    L.push("No high-conviction setup right now.");
  } else {
    for (const t of plan.trades) {
      L.push("──────────────────");
      L.push("");
      L.push(`<b>#${t.rank} [Grade ${t.grade}] · ${t.direction} ${t.strike} ${t.optionType}</b>`);
      L.push(`Strategy  : ${t.strategy}`);
      L.push(`Bias      : ${t.bias}`);
      L.push(`Entry     : ₹${inr(t.entry)}`);
      L.push(`Target    : ₹${inr(t.target)}`);
      L.push(`Stop      : ₹${inr(t.stop)}`);
      L.push(`R:R       : ${t.rr}   ·   Confidence : ${t.confidence}%`);
      if (t.rationale && t.rationale.length) {
        L.push("");
        for (const r of t.rationale.slice(0, 3)) L.push(`• ${r}`);
      }
      L.push("");
      L.push(`⛔ Invalidation: ${t.invalidation}`);
      L.push("");
    }
  }

  L.push("━━━━━━━━━━━━━━━━━━");
  L.push(`⚠️ ${plan.caution}`);
  L.push(
    `<i>⚡ Powered by Google Gemini 3.8 Flash · InvestIQ Alerts</i>`,
  );
  return L.join("\n");
}

const plan = {
  symbol: "NIFTY",
  expiry,
  spot,
  pcr,
  maxPain,
  marketView: parsed.marketView || "Bullish build-up observed in ATM put writing.",
  caution: parsed.caution || "Educational only — derivative trades carry high market risk.",
  trades: parsed.trades || [],
};

const messageText = buildTradeMessage(plan);
console.log("\nGenerated Telegram Message:\n");
console.log(messageText);

console.log("\nDispatching alert to Telegram recipients...");
let sentCount = 0;
for (const cid of chatIds) {
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cid,
        text: messageText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const tgJson = await tgRes.json();
    if (tgJson.ok) {
      console.log(`[Telegram] Sent successfully to chat ${cid}!`);
      sentCount++;
    } else {
      console.warn(`[Telegram] Failed for chat ${cid}:`, tgJson.description);
    }
  } catch (err) {
    console.error(`[Telegram] Error sending to ${cid}:`, err.message);
  }
}

console.log(`\nCompleted! Successfully delivered to ${sentCount}/${chatIds.length} chats.`);
