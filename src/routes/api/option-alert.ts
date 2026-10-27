import { createFileRoute } from "@tanstack/react-router";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { escapeHtml, getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";

/**
 * Telegram notifications for option-chain trading.
 *
 * Accepts a structured payload only — the message text is composed server-side
 * so no caller can push arbitrary content to the bot. TELEGRAM_BOT_TOKEN stays
 * server-side. Requires CRON_SECRET (x-cron-secret or Authorization: Bearer).
 */

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
  pnl: "📊 P&amp;L UPDATE",
  level: "🎯 PRICE LEVEL BREACHED",
  volatility: "⚡ HIGH VOLATILITY",
  unusual: "🔍 UNUSUAL OPTION ACTIVITY",
  margin: "⚠️ MARGIN ALERT",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

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
  const kind = p.kind && p.kind in TITLES ? p.kind : "execution";
  const lines: string[] = [];
  lines.push(`<b>${TITLES[kind]}</b>`);
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");

  const contract = [
    p.symbol ? String(p.symbol).slice(0, 40) : null,
    p.expiry ? String(p.expiry).slice(0, 20) : null,
    p.strike ? String(p.strike) : null,
    p.optionType === "CE" || p.optionType === "PE" ? p.optionType : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (contract) lines.push(`<b>${escapeHtml(contract)}</b>`);
  if (p.direction === "BUY" || p.direction === "SELL")
    lines.push(`Direction : <b>${p.direction}</b>`);
  if (isNum(p.qty)) lines.push(`Quantity  : ${p.qty}`);
  if (isNum(p.entry)) lines.push(`Entry     : ₹${inr(p.entry)}`);
  if (isNum(p.exit)) lines.push(`Exit      : ₹${inr(p.exit)}`);
  if (isNum(p.ltp)) lines.push(`LTP       : ₹${inr(p.ltp)}`);
  if (isNum(p.iv)) lines.push(`IV        : ${p.iv.toFixed(1)}%`);
  if (isNum(p.oiChange))
    lines.push(`Chg in OI : ${p.oiChange > 0 ? "+" : ""}${p.oiChange.toLocaleString("en-IN")}`);
  if (isNum(p.pnl)) {
    const tag = p.pnl >= 0 ? "🟢 PROFIT" : "🔴 LOSS";
    lines.push("");
    lines.push(`P&amp;L       : <b>${tag} ₹${inr(Math.abs(p.pnl))}</b>`);
  }
  if (p.note) {
    lines.push("");
    lines.push(escapeHtml(String(p.note).slice(0, 300)));
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(`<i>${istNow().toISOString().slice(11, 16)} IST · InvestIQ Terminal</i>`);
  return lines.join("\n");
}

export const Route = createFileRoute("/api/option-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);
          const body = await readJsonBody<Payload & { chatIds: string[] }>(request);
          if (!body.force && inQuietHours()) {
            return hookResponse({ sent: 0, skipped: 1, errors: [], reason: "quiet-hours" });
          }
          const text = buildMessage(body);
          const chatIds = resolveChatIds(body.chatIds);
          const res = await sendToMany(token, chatIds, text, { delayMs: 150 });
          console.log(
            `[option-alert] kind=${body.kind ?? "execution"} sent=${res.delivered}/${chatIds.length}`,
          );
          return hookResponse({
            sent: res.delivered,
            skipped: 0,
            errors: res.errors,
            total: chatIds.length,
          });
        } catch (e) {
          const err = e as Error;
          console.error("[option-alert]", err.message);
          return hookFailure(err.message);
        }
      },
    },
  },
});
