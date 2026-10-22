import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1WgMLvMlUewkeljWkwFH6Cmcryytn8cWgIXgsmlq1Syo/edit?usp=sharing";
const DEFAULT_SHEET_NAME = "Sheet1";
// Columns in the "Today Buy" section of the sheet
const COL_RANK = 0; // A
const COL_RSI = 1;  // B
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
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  return parseCsv(await res.text());
}

// Permanent Telegram chat IDs — always receive the alert.
const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"];

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`Telegram(${chatId}): ${json.description ?? "unknown"}`);
}

export const Route = createFileRoute("/api/public/hooks/rsi-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request?.json().catch(() => ({}))) as { chatIds?: string[] } | undefined;
          const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";

          const envIds = (process.env.TELEGRAM_CHAT_ID ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const chatIds = body?.chatIds?.length
            ? Array.from(new Set(body.chatIds.map((s) => String(s).trim()).filter(Boolean)))
            : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));

          const sheetUrl = process.env.RSI_SHEET_URL || DEFAULT_SHEET_URL;
          const sheetName = process.env.RSI_SHEET_NAME || DEFAULT_SHEET_NAME;
          const rows = await readSheet(sheetUrl, sheetName);

          // Locate the "Today Buy" cell; the section can be embedded to the
          // right of the main table (e.g. columns E–G). Use the column of
          // that cell as the Rank column and +1/+2 as RSI/Name.
          let baseCol = -1;
          let startIdx = -1;
          for (let i = 0; i < rows.length; i++) {
            const idx = rows[i].findIndex(
              (c) => (c ?? "").trim().toLowerCase() === "today buy",
            );
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
            return Response.json({ ok: false, error: "No ETF rows found under Today Buy" }, { status: 404 });
          }

          const today = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Kolkata",
          });

          const lines = picks.map(
            (p, i) => `<b>#${i + 1}</b>  <code>${p.name}</code>  ·  RSI <b>${p.rsi.toFixed(2)}</b>`,
          );
          const message =
            `📉 <b>InvestIQ — Top 5 Lowest RSI ETFs</b>\n` +
            `<i>${today} · 11:45 AM IST</i>\n\n` +
            lines.join("\n") +
            `\n\n<i>Not investment advice. RSI &lt; 30 = oversold zone.</i>`;

          const results = await Promise.allSettled(
            chatIds.map((id) => sendTelegram(token, id, message)),
          );
          const delivered = results.filter((r) => r.status === "fulfilled").length;
          const errors = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map((r) => (r.reason as Error).message);

          return Response.json({
            ok: delivered > 0,
            sent: picks.length,
            recipients: chatIds,
            delivered,
            errors,
            picks,
          });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
