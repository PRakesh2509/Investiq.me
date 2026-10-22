import { createFileRoute } from "@tanstack/react-router";
import { FUNDS, FUND_CATEGORIES, type FundCategory } from "@/lib/funds";
import { getFundData } from "@/lib/funds.functions";

const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"];
const CATEGORY_EMOJI: Record<FundCategory, string> = {
  index: "📊", largecap: "🏦", midcap: "🚀", smallcap: "💎",
  flexicap: "🌐", multicap: "🎯", elss: "💰",
};
const RULE = "━━━━━━━━━━━━━━━━━━━━";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`TG(${chatId}): ${json.description}`);
}

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
    `${rank}️⃣ <b>${f.name}</b>`,
    `🏦 ${f.amc}  ·  👤 ${f.manager} (${f.managerYears}y)`,
    `💰 NAV ${nav}${chg}   ⭐ ${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}`,
    `📈 1Y ${fmtPct(live?.return1y)} · 3Y ${fmtPct(live?.return3y)} · 5Y ${fmtPct(live?.return5y)}`,
    `💸 Expense ${f.expenseRatio.toFixed(2)}% <i>(avg ${f.categoryAvgER.toFixed(2)}%)</i> · ⚠️ ${f.risk}`,
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
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  const list = FUNDS[category].slice(0, 5);
  const blocks = list.map((f, i) => fundBlock(i + 1, f, lives[i] ?? null));
  return [
    `${CATEGORY_EMOJI[category]} <b>MUTUAL FUNDS · ${meta.label.toUpperCase()}</b>`,
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
        try {
          const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
          const url = new URL(request.url);
          const qParam = url.searchParams.get("category") as FundCategory | null;
          let bodyCat: FundCategory | null = null;
          let bodyChatIds: string[] | undefined = undefined;
          try {
            const body = (await request.clone().json()) as { category?: FundCategory; chatIds?: string[] };
            bodyCat = body?.category ?? null;
            bodyChatIds = body?.chatIds;
          } catch { /* body optional */ }
          const only = qParam ?? bodyCat;

          const envIds = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const chatIds = bodyChatIds?.length
            ? Array.from(new Set(bodyChatIds.map((s) => String(s).trim()).filter(Boolean)))
            : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));

          const cats: FundCategory[] = only
            ? [only]
            : ["largecap", "midcap", "smallcap", "flexicap", "multicap", "index", "elss"];

          let delivered = 0;
          const errors: string[] = [];
          for (const c of cats) {
            const list = FUNDS[c].slice(0, 5);
            const results = await Promise.all(
              list.map((f) => getFundData({ data: { schemeCode: f.schemeCode } }).catch(() => null)),
            );

            // ONE combined message per category
            const msg = categoryMessage(c, results);
            for (const id of chatIds) {
              try { await sendTelegram(token, id, msg); delivered++; }
              catch (e) { errors.push((e as Error).message); }
              await sleep(250);
            }
            await sleep(1200);
          }
          return Response.json({ ok: delivered > 0, delivered, categories: cats, recipients: chatIds, errors });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
