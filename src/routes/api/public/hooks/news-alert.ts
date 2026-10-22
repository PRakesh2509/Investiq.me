import { createFileRoute } from "@tanstack/react-router";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";

const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"];
const RULE = "━━━━━━━━━━━━━━━━━━━━";

// Popular Indian ETFs — treated exactly like stocks in the news flow.
const ETF_UNIVERSE: { symbol: string; name: string; query: string }[] = [
  { symbol: "NIFTYBEES", name: "Nippon Nifty 50 ETF",        query: "Nippon Nifty BeES ETF" },
  { symbol: "BANKBEES",  name: "Nippon Bank ETF",            query: "Nippon Bank BeES ETF" },
  { symbol: "GOLDBEES",  name: "Nippon Gold ETF",            query: "Gold BeES ETF India" },
  { symbol: "SILVERBEES",name: "Nippon Silver ETF",          query: "Silver BeES ETF India" },
  { symbol: "JUNIORBEES",name: "Nippon Nifty Next 50 ETF",   query: "Junior BeES Nifty Next 50 ETF" },
  { symbol: "ITBEES",    name: "Nippon Nifty IT ETF",        query: "IT BeES ETF India" },
  { symbol: "CPSEETF",   name: "CPSE ETF",                   query: "CPSE ETF India" },
  { symbol: "SETFNIF50", name: "SBI Nifty 50 ETF",           query: "SBI ETF Nifty 50" },
  { symbol: "MON100",    name: "Motilal Nasdaq 100 ETF",     query: "Motilal Oswal Nasdaq 100 ETF" },
  { symbol: "MOM100",    name: "Motilal Midcap 100 ETF",     query: "Motilal Oswal Midcap 100 ETF" },
  { symbol: "HDFCNIFTY", name: "HDFC Nifty 50 ETF",          query: "HDFC Nifty 50 ETF" },
  { symbol: "ICICINIFTY",name: "ICICI Pru Nifty 50 ETF",     query: "ICICI Prudential Nifty ETF" },
  { symbol: "PSUBNKBEES",name: "Nippon PSU Bank ETF",        query: "PSU Bank BeES ETF" },
  { symbol: "LIQUIDBEES",name: "Nippon Liquid ETF",          query: "Liquid BeES ETF" },
];

// Universe as { symbol, name, query, kind }. Rotate a small slice per run.
type Entry = { symbol: string; name: string; query: string; kind: "STOCK" | "ETF" };
const UNIVERSE: Entry[] = [
  ...NIFTY_UNIVERSE.map((s) => ({ symbol: s.symbol, name: s.name, query: `${s.name} stock`, kind: "STOCK" as const })),
  ...ETF_UNIVERSE.map((e) => ({ symbol: e.symbol, name: e.name, query: e.query, kind: "ETF" as const })),
];

// Per run we scan this many entries. Cron runs every 10 minutes in market
// hours, we send AT MOST ONE headline per run to avoid flooding.
const SLICE_SIZE = 12;
const MAX_ITEMS_PER_RUN = 1;
const SEND_DELAY_MS = 400;

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`Telegram(${chatId}): ${json.description ?? "unknown"}`);
}

interface NewsItem {
  guid: string; title: string; link: string; pubDate: string; description: string; source: string;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}
function stripHtml(s: string): string {
  // Decode entities FIRST, then strip tags repeatedly — RSS descriptions
  // embed escaped HTML (<a href="...">) inside CDATA, so a single pass
  // leaves raw "a href=..." fragments behind.
  let out = decode(s);
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/<[^>]*>/g, " ");
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/\b(?:href|target|rel|color|face|size)\s*=\s*("[^"]*"|'[^']*'|\S*)/gi, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function summarize(title: string, description: string): string {
  let desc = stripHtml(description)
    // Google News descriptions often end with "  <source name>" boilerplate
    .replace(/\s*\|\s*$/, "")
    .trim();
  // Reject junk summaries (leftover markup words, bare URLs, or just the title)
  const junk =
    !desc ||
    desc.length < 40 ||
    /https?:\/\//i.test(desc) ||
    /\b(?:a href|font color|target=|nbsp|_blank)\b/i.test(desc) ||
    desc.toLowerCase().startsWith(title.toLowerCase().slice(0, 40));
  if (junk) desc = "";
  const base = desc || title;
  const sentences = base.match(/[^.!?]+[.!?]+/g) ?? [base];
  const picked = sentences.slice(0, 3).join(" ").trim();
  return picked.length > 320 ? picked.slice(0, 317).trimEnd() + "…" : (picked || title);
}
function formatIST(pubDate: string): string {
  const d = pubDate ? new Date(pubDate) : new Date();
  const valid = !Number.isNaN(d.getTime()) ? d : new Date();
  const date = valid.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = valid.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date.replace(/\//g, "-")} · ${time} IST`;
}

// Google News RSS — reliably returns stock-specific Indian headlines.
async function fetchNews(entry: Entry): Promise<NewsItem[]> {
  const q = `${entry.query} when:2d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const pick = (tag: string) => {
        const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
        if (!r) return "";
        return r[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
      };
      const title = stripHtml(pick("title")).replace(/\]\]>?$/, "").trim();
      const link = pick("link");
      const guid = pick("guid") || link;
      const pubDate = pick("pubDate");
      const description = pick("description");
      const source = pick("source");
      if (!title || !guid) continue;
      items.push({ guid, title, link, pubDate, description, source });
      if (items.length >= 3) break;
    }
    return items;
  } catch {
    return [];
  }
}

function buildMessage(entry: Entry, item: NewsItem): string {
  const ticker = entry.symbol.replace(/\.(NS|BO)$/i, "");
  const source = item.source ? stripHtml(item.source) : "";
  const sourceName = source || "source";
  const readLine = item.link
    ? `Read on <a href="${item.link}">${escapeHtml(sourceName)}</a>`
    : "";
  return [
    `<b>${escapeHtml(entry.name)}</b>  <code>${escapeHtml(ticker)}</code>`,
    RULE,
    ``,
    ``,
    `<b>${escapeHtml(item.title)}</b>`,
    ``,
    ``,
    escapeHtml(summarize(item.title, item.description)),
    ``,
    ``,
    `<i>${escapeHtml(formatIST(item.pubDate))}</i>`,
    readLine,
    ``,
    ``,
    RULE,
    `<i>Auto news \· For information only, not investment advice</i>`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "") && !(l === "" && i === a.length - 1)).join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pick the rotating slice for this run based on UTC minute-of-hour.
function pickSlice(): Entry[] {
  const minute = new Date().getUTCMinutes();
  const startBucket = (minute * SLICE_SIZE) % UNIVERSE.length;
  const out: Entry[] = [];
  for (let i = 0; i < SLICE_SIZE; i++) {
    out.push(UNIVERSE[(startBucket + i) % UNIVERSE.length]);
  }
  return out;
}

export const Route = createFileRoute("/api/public/hooks/news-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
        const body = (await request?.json().catch(() => ({}))) as { chatIds?: string[] } | undefined;
        const envIds = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const chatIds = body?.chatIds?.length
          ? Array.from(new Set(body.chatIds.map((s) => String(s).trim()).filter(Boolean)))
          : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const slice = pickSlice();
        const perEntry = await Promise.all(
          slice.map(async (e) => ({ entry: e, items: await fetchNews(e) })),
        );

        const allGuids = perEntry.flatMap((c) => c.items.map((i) => i.guid));
        if (allGuids.length === 0) {
          return Response.json({ ok: true, skipped: true, reason: "no news fetched", slice: slice.map((s) => s.symbol) });
        }
        const { data: seen } = await supabaseAdmin
          .from("news_sent")
          .select("guid")
          .in("guid", allGuids);
        const seenSet = new Set((seen ?? []).map((r: any) => r.guid));

        const fresh: { entry: Entry; item: NewsItem }[] = [];
        for (const c of perEntry) {
          for (const item of c.items) {
            if (!seenSet.has(item.guid)) fresh.push({ entry: c.entry, item });
          }
        }
        if (fresh.length === 0) {
          return Response.json({ ok: true, skipped: true, reason: "no new headlines", slice: slice.map((s) => s.symbol) });
        }

        const toSend = fresh.slice(0, MAX_ITEMS_PER_RUN);
        await supabaseAdmin.from("news_sent").insert(
          toSend.map((f) => ({
            guid: f.item.guid,
            symbol: f.entry.symbol,
            title: f.item.title.slice(0, 500),
            link: f.item.link,
          })),
        );

        let delivered = 0;
        const errors: string[] = [];
        for (const f of toSend) {
          const msg = buildMessage(f.entry, f.item);
          for (const chatId of chatIds) {
            try { await sendTelegram(token, chatId, msg); delivered += 1; }
            catch (e) { errors.push((e as Error).message); }
            await sleep(150);
          }
          await sleep(SEND_DELAY_MS);
        }

        return Response.json({
          ok: delivered > 0,
          headlines: toSend.length,
          queuedRemaining: Math.max(0, fresh.length - toSend.length),
          slice: slice.map((s) => s.symbol),
          recipients: chatIds,
          delivered,
          errors,
        });
      },
    },
  },
});
