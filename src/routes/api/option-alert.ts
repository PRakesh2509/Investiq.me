import { createFileRoute } from "@tanstack/react-router";

/**
 * Telegram notifications for option-chain trading.
 *
 * Accepts a structured payload only — the message text is composed server-side
 * so no caller can push arbitrary content to the bot. TELEGRAM_BOT_TOKEN stays
 * server-side.
 */

const PERMANENT_CHAT_IDS = [
  "7350570004",
  "5589831995",
  "1840901163",
  "1360613728",
  "8155139346",
  "6799336293", "7280324188", "6698697147",
];

type Payload = {
  kind?: "order" | "execution" | "pnl" | "level" | "volatility" | "unusual" | "margin";
  symbol?: string;
  expiry?: string;
  strike?: number;
  optionType?: "CE" | "PE";
  direction?: "BUY" | "SELL";
  qty?: number;
  entry?: number;
  exit?: number;
  pnl?: number;
  ltp?: number;
  iv?: number;
  oiChange?: number;
  note?: string;
  force?: boolean;
};

const TITLES: Record<NonNullable<Payload["kind"]>, string> = {
  order: "🟡 ORDER PLACED",
  execution: "🟢 TRADE EXECUTED",
  pnl: "📊 P&L UPDATE",
  level: "🎯 PRICE LEVEL BREACHED",
  volatility: "⚡ HIGH VOLATILITY",
  unusual: "🔍 UNUSUAL OPTION ACTIVITY",
  margin: "⚠️ MARGIN ALERT",
};

const inr = (v: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function istNow() {
  return new Date(Date.now() + 5.5 * 3600 * 1000);
}

/** Quiet hours: 23:00 → 07:00 IST. Overridable with force. */
function inQuietHours() {
  const h = istNow().getUTCHours();
  return h >= 23 || h < 7;
}

function buildMessage(p: Payload) {
  const kind = p.kind ?? "execution";
  const lines: string[] = [];
  lines.push(`<b>${TITLES[kind]}</b>`);
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");

  const contract = [p.symbol, p.expiry, p.strike ? String(p.strike) : null, p.optionType]
    .filter(Boolean)
    .join(" · ");
  if (contract) lines.push(`<b>${contract}</b>`);
  if (p.direction) lines.push(`Direction : <b>${p.direction}</b>`);
  if (typeof p.qty === "number") lines.push(`Quantity  : ${p.qty}`);
  if (typeof p.entry === "number") lines.push(`Entry     : ₹${inr(p.entry)}`);
  if (typeof p.exit === "number") lines.push(`Exit      : ₹${inr(p.exit)}`);
  if (typeof p.ltp === "number") lines.push(`LTP       : ₹${inr(p.ltp)}`);
  if (typeof p.iv === "number") lines.push(`IV        : ${p.iv.toFixed(1)}%`);
  if (typeof p.oiChange === "number")
    lines.push(`Chg in OI : ${p.oiChange > 0 ? "+" : ""}${p.oiChange.toLocaleString("en-IN")}`);
  if (typeof p.pnl === "number") {
    const tag = p.pnl >= 0 ? "🟢 PROFIT" : "🔴 LOSS";
    lines.push("");
    lines.push(`P&L       : <b>${tag} ₹${inr(Math.abs(p.pnl))}</b>`);
  }
  if (p.note) {
    lines.push("");
    lines.push(p.note.slice(0, 300));
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(
    `<i>${istNow().toISOString().slice(11, 16)} IST · InvestIQ Terminal</i>`,
  );
  return lines.join("\n");
}

async function sendTelegram(token: string, chatId: string, text: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
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
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (json.ok) return true;
      if (attempt === 2) throw new Error(json.description ?? "unknown");
    } catch (e) {
      if (attempt === 2) {
        console.error("[option-alert]", chatId, (e as Error).message);
        return false;
      }
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return false;
}

export const Route = createFileRoute("/api/option-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = process.env["TELEGRAM_BOT_TOKEN"];
          if (!token) {
            return Response.json(
              { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" },
              { status: 500 },
            );
          }
          const body = (await request.json().catch(() => ({}))) as Payload & { chatIds?: string[] };
          if (!body.force && inQuietHours()) {
            return Response.json({ ok: true, skipped: "quiet-hours" });
          }
          const text = buildMessage(body);
          const envIds = (process.env["TELEGRAM_CHAT_ID"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const chatIds = body.chatIds?.length
            ? Array.from(new Set(body.chatIds.map((s) => String(s).trim()).filter(Boolean)))
            : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));
          const results = await Promise.all(
            chatIds.map((id) => sendTelegram(token, id, text)),
          );
          const sent = results.filter(Boolean).length;
          console.log(`[option-alert] kind=${body.kind ?? "execution"} sent=${sent}/${results.length}`);
          return Response.json({ ok: sent > 0, sent, total: results.length });
        } catch (e) {
          const err = e as Error;
          console.error("[option-alert]", err.message);
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
