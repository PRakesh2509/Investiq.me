import { createFileRoute } from "@tanstack/react-router";
import { FUNDS, FUND_CATEGORIES, type FundCategory, type FundStatic } from "@/lib/funds";
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

// In-isolate deduplication so Monday 9:30 AM digest sends at most once per week
const sentWeeks = new Set<string>();

function getIstTime() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const weekKey = `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
  return { day, weekKey };
}

function fmtPct(v?: number): string {
  return typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
}

/** Compact single-fund block for single-category on-demand alert. */
function fundBlock(
  rank: number,
  f: FundStatic,
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

/** One combined message for a specific single requested category. */
function singleCategoryMessage(
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
    `<i>Curated selection · ${now} IST · Top 5</i>`,
    RULE,
    ``,
    blocks.join(`\n${RULE}\n`),
    ``,
    RULE,
    `<i>Mutual Fund investments are subject to market risks.</i>`,
    `<i>Educational only · consult a SEBI-registered advisor.</i>`,
  ].join("\n");
}

/** Unified master weekly digest message (prevents notification overflow). */
function weeklyMasterDigestMessage(
  picks: Array<{
    category: FundCategory;
    fund: FundStatic;
    live: Awaited<ReturnType<typeof getFundData>> | null;
  }>,
): string {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const blocks = picks.map(({ category, fund, live }) => {
    const meta = FUND_CATEGORIES.find((c) => c.id === category)!;
    const nav = live?.currentNav ? `₹${live.currentNav.toFixed(2)}` : "—";
    const chg = live?.changePct != null ? ` (${fmtPct(live.changePct)})` : "";
    const ret1y = live?.return1y != null ? fmtPct(live.return1y) : "—";
    const ret3y = live?.return3y != null ? fmtPct(live.return3y) : "—";

    return [
      `${CATEGORY_EMOJI[category]} <b>${escapeHtml(meta.label.toUpperCase())}</b>: <b>${escapeHtml(fund.name)}</b>`,
      `   🏦 ${escapeHtml(fund.amc)} · ⭐ ${"★".repeat(fund.rating)}${"☆".repeat(5 - fund.rating)}`,
      `   💰 NAV: <b>${nav}${chg}</b> · 1Y: <b>${ret1y}</b> · 3Y: <b>${ret3y}</b>`,
      `   💸 Expense: <b>${fund.expenseRatio.toFixed(2)}%</b> · Risk: <b>${escapeHtml(fund.risk)}</b>`,
      `   💡 <i>${escapeHtml(fund.note)}</i>`,
    ].join("\n");
  });

  return [
    `🏆 <b>InvestIQ — Weekly Mutual Fund Digest</b>`,
    `<i>${dateStr} · Monday 09:30 AM IST</i>`,
    `<i>Top institutional pick across all 7 asset classes</i>`,
    RULE,
    ``,
    blocks.join(`\n\n`),
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
          const body = await readJsonBody<{
            category?: FundCategory;
            chatIds?: string[];
            force?: boolean;
          }>(request);
          const force = !!body?.force;
          const { day, weekKey } = getIstTime();

          // Mutual Fund digest runs on Mondays 9:30 AM IST only (unless force=true for manual testing)
          if (!force && day !== 1) {
            return hookResponse({
              sent: 0,
              skipped: 1,
              errors: [],
              reason: "Mutual Fund digest runs on Mondays 9:30 AM IST only",
            });
          }

          const only = (url.searchParams.get("category") ??
            body?.category ??
            null) as FundCategory | null;
          if (only && !Array.isArray(FUNDS[only])) {
            return hookFailure(`unknown category "${String(only).slice(0, 30)}"`, 400);
          }

          const chatIds = resolveChatIds(body?.chatIds);

          // If full weekly run (not single category), enforce deduplication per week
          if (!only && !force) {
            if (sentWeeks.has(weekKey)) {
              return hookResponse({
                sent: 0,
                skipped: 1,
                errors: [],
                reason: `Mutual Fund digest already sent for week ${weekKey}`,
              });
            }
          }

          // Case 1: Single specific category requested
          if (only) {
            const list = FUNDS[only].slice(0, 5);
            const results = await Promise.all(
              list.map((f) =>
                getFundData({ data: { schemeCode: f.schemeCode } }).catch(() => null),
              ),
            );
            const res = await sendToMany(token, chatIds, singleCategoryMessage(only, results), {
              delayMs: 250,
            });
            return hookResponse({
              sent: res.delivered,
              skipped: 0,
              errors: res.errors,
              categories: [only],
              recipients: chatIds.length,
              delivered: res.delivered,
            });
          }

          // Case 2: Master Weekly Digest across all 7 categories in ONE unified message
          const topPicks = await Promise.all(
            DEFAULT_CATEGORIES.map(async (c) => {
              const topFund = FUNDS[c][0];
              const live = await getFundData({ data: { schemeCode: topFund.schemeCode } }).catch(
                () => null,
              );
              return { category: c, fund: topFund, live };
            }),
          );

          const digestText = weeklyMasterDigestMessage(topPicks);
          const res = await sendToMany(token, chatIds, digestText, { delayMs: 250 });
          if (res.delivered > 0 && !force) {
            sentWeeks.add(weekKey);
          }

          return hookResponse({
            sent: res.delivered,
            skipped: 0,
            errors: res.errors,
            categories: DEFAULT_CATEGORIES,
            recipients: chatIds.length,
            delivered: res.delivered,
            mode: "unified-weekly-digest",
          });
        } catch (e) {
          console.error("[funds-alert]", (e as Error).message);
          return hookFailure((e as Error).message);
        }
      },
    },
  },
});
