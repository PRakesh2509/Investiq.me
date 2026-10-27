import { createFileRoute } from "@tanstack/react-router";
import { FUNDS, FUND_CATEGORIES, type FundCategory } from "@/lib/funds";
import { getFundData } from "@/lib/funds.functions";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { escapeHtml, getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";

const CATEGORY_EMOJI: Record<FundCategory, string> = {
  index: "📊",
  largecap: "🏦",
  midcap: "🚀",
  smallcap: "💎",
  flexicap: "🌐",
  multicap: "🎯",
  elss: "💰",
};
const DEFAULT_CATEGORIES: FundCategory[] = [
  "largecap",
  "midcap",
  "smallcap",
  "flexicap",
  "multicap",
  "index",
  "elss",
];
const RULE = "━━━━━━━━━━━━━━━━━━━━";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtPct(v?: number): string {
  return typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
}

/** Compact single-fund block (goes inside the combined category message). */
function fundBlock(
  rank: number,
  f: ReturnType<typeof pickFund>,
  live: Awaited<ReturnType<typeof getFundData>> | null,
): string {
  const nav = live?.currentNav ? `₹${live.currentNav.toFixed(2)}` : "—";
  const chg = live?.changePct != null ? ` (${fmtPct(live.changePct)})` : "";
  return [
    `${rank}️⃣ <b>${escapeHtml(f.name)}</b>`,
    `🏦 ${escapeHtml(f.amc)}  ·  👤 ${escapeHtml(f.manager)} (${f.managerYears}y)`,
    `💰 NAV ${nav}${chg}   ⭐ ${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}`,
    `📈 1Y ${fmtPct(live?.return1y)} · 3Y ${fmtPct(live?.return3y)} · 5Y ${fmtPct(live?.return5y)}`,
    `💸 Expense ${f.expenseRatio.toFixed(2)}% <i>(avg ${f.categoryAvgER.toFixed(2)}%)</i> · ⚠️ ${escapeHtml(f.risk)}`,
  ].join("\n");
}

function pickFund(category: FundCategory, i: number) {
  return FUNDS[category][i];
}

/** One combined message per category: header + all 5 funds + footer. */
function categoryMessage(
  category: FundCategory,
  lives: Array<Awaited<ReturnType<typeof getFundData>> | null>,
): string {
  const meta = FUND_CATEGORIES.find((c) => c.id === category)!;
  const now = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const list = FUNDS[category].slice(0, 5);
  const blocks = list.map((f, i) => fundBlock(i + 1, f, lives[i] ?? null));
  return [
    `${CATEGORY_EMOJI[category]} <b>MUTUAL FUNDS · ${escapeHtml(meta.label.toUpperCase())}</b>`,
    `<i>Daily digest · ${now} IST · Top 5</i>`,
    RULE,
    ``,
    blocks.join(`\n${RULE}\n`),
    ``,
    RULE,
    `<i>Mutual Fund investments are subject to market risks.</i>`,
    `<i>Educational only · consult a SEBI-registered advisor.</i>`,
  ].join("\n");
}

export const Route = createFileRoute("/api/public/hooks/funds-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);

          const url = new URL(request.url);
          const body = await readJsonBody<{ category: FundCategory; chatIds: string[] }>(request);
          const only = (url.searchParams.get("category") ??
            body.category ??
            null) as FundCategory | null;
          if (only && !Array.isArray(FUNDS[only])) {
            return hookFailure(`unknown category "${String(only).slice(0, 30)}"`, 400);
          }

          const chatIds = resolveChatIds(body.chatIds);
          const cats: FundCategory[] = only ? [only] : DEFAULT_CATEGORIES;

          let sent = 0;
          const errors: string[] = [];
          for (const c of cats) {
            try {
              const list = FUNDS[c].slice(0, 5);
              const results = await Promise.all(
                list.map((f) =>
                  getFundData({ data: { schemeCode: f.schemeCode } }).catch(() => null),
                ),
              );
              // ONE combined message per category
              const res = await sendToMany(token, chatIds, categoryMessage(c, results), {
                delayMs: 250,
              });
              sent += res.delivered;
              errors.push(...res.errors);
            } catch (e) {
              errors.push(`${c}: ${(e as Error).message}`);
            }
            await sleep(1200);
          }
          return hookResponse({
            sent,
            skipped: 0,
            errors,
            categories: cats,
            recipients: chatIds.length,
            delivered: sent,
          });
        } catch (e) {
          console.error("[funds-alert]", (e as Error).message);
          return hookFailure((e as Error).message);
        }
      },
    },
  },
});
