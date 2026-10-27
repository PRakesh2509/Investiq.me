import { createFileRoute } from "@tanstack/react-router";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { escapeHtml, getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1WgMLvMlUewkeljWkwFH6Cmcryytn8cWgIXgsmlq1Syo/edit?usp=sharing";
const DEFAULT_SHEET_NAME = "Sheet1";
// Columns in the "Today Buy" section of the sheet
const COL_RANK = 0; // A
const COL_RSI = 1; // B
const COL_NAME = 2; // C

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.length)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (c === "," && !inQ) {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
      out.push(cur);
      return out;
    });
}

async function readSheet(url: string, sheetName: string) {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) throw new Error("Invalid sheet URL");
  const csvUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(csvUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  return parseCsv(await res.text());
}

export const Route = createFileRoute("/api/public/hooks/rsi-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const body = await readJsonBody<{ chatIds: string[] }>(request);
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);
          const chatIds = resolveChatIds(body.chatIds);

          const sheetUrl = process.env.RSI_SHEET_URL || DEFAULT_SHEET_URL;
          const sheetName = process.env.RSI_SHEET_NAME || DEFAULT_SHEET_NAME;
          const rows = await readSheet(sheetUrl, sheetName);

          // Locate the "Today Buy" cell; the section can be embedded to the
          // right of the main table (e.g. columns E–G). Use the column of
          // that cell as the Rank column and +1/+2 as RSI/Name.
          let baseCol = -1;
          let startIdx = -1;
          for (let i = 0; i < rows.length; i++) {
            const idx = rows[i].findIndex((c) => (c ?? "").trim().toLowerCase() === "today buy");
            if (idx >= 0) {
              baseCol = idx;
              startIdx = i;
              break;
            }
          }
          const scan = startIdx >= 0 ? rows.slice(startIdx + 1) : rows;
          const cRank = baseCol >= 0 ? baseCol : COL_RANK;
          const cRSI = baseCol >= 0 ? baseCol + 1 : COL_RSI;
          const cName = baseCol >= 0 ? baseCol + 2 : COL_NAME;

          const picks = scan
            .map((r) => ({
              rank: r[cRank] ?? "",
              rsi: Number(r[cRSI]),
              name: (r[cName] ?? "").trim(),
            }))
            .filter((r) => /^(NSE|BSE):/i.test(r.name) && Number.isFinite(r.rsi) && r.rsi > 0)
            .slice(0, 5);

          if (picks.length === 0) {
            return hookFailure("No ETF rows found under Today Buy", 404);
          }

          const today = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Kolkata",
          });

          const lines = picks.map(
            (p, i) =>
              `<b>#${i + 1}</b>  <code>${escapeHtml(p.name)}</code>  ·  RSI <b>${p.rsi.toFixed(2)}</b>`,
          );
          const message =
            `📉 <b>InvestIQ — Top 5 Lowest RSI ETFs</b>\n` +
            `<i>${today} · 11:45 AM IST</i>\n\n` +
            lines.join("\n") +
            `\n\n<i>Not investment advice. RSI &lt; 30 = oversold zone.</i>`;

          const res = await sendToMany(token, chatIds, message, { delayMs: 150 });
          return hookResponse({
            sent: res.delivered,
            skipped: 0,
            errors: res.errors,
            delivered: res.delivered,
            recipients: chatIds.length,
            picks,
          });
        } catch (e) {
          console.error("[rsi-alert]", (e as Error).message);
          return hookFailure((e as Error).message);
        }
      },
    },
  },
});
