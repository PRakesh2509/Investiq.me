import { createServerFn } from "@tanstack/react-start";

export type ListedIpo = {
  symbol: string;
  company: string;
  issuePrice: number;
  listingDate: string; // ISO
  price: number | null;
  changeAbs: number | null;
  changePct: number | null;
  dayChangePct: number | null;
};

const NSE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function nsePastIssues(): Promise<any[]> {
  const prime = await fetch("https://www.nseindia.com/market-data/all-upcoming-issues-ipo", {
    headers: { "User-Agent": NSE_UA, Accept: "text/html" },
  });
  const cookie =
    prime.headers
      .getSetCookie?.()
      ?.map((c) => c.split(";")[0])
      .join("; ") ??
    prime.headers
      .get("set-cookie")
      ?.split(",")
      .map((c) => c.split(";")[0])
      .join("; ") ??
    "";
  const res = await fetch("https://www.nseindia.com/api/public-past-issues", {
    headers: {
      "User-Agent": NSE_UA,
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
      Cookie: cookie,
    },
  });
  if (!res.ok) throw new Error(`NSE past-issues HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function parseNseDate(s: string): string {
  if (!s || s === "-") return "";
  const [d, mon, y] = s.split("-");
  if (!d || !mon || !y) return "";
  return `${y}-${MONTHS[mon.toUpperCase()] ?? "01"}-${d.padStart(2, "0")}`;
}

async function yahooPrice(symbol: string): Promise<{ price: number | null; dayChangePct: number | null }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      { headers: { "User-Agent": NSE_UA, Accept: "application/json" } },
    );
    if (!res.ok) return { price: null, dayChangePct: null };
    const json: any = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.previousClose ?? meta?.chartPreviousClose);
    if (!Number.isFinite(price) || price <= 0) return { price: null, dayChangePct: null };
    const dayChangePct = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : null;
    return { price, dayChangePct };
  } catch {
    return { price: null, dayChangePct: null };
  }
}

export const getListedIpos = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: boolean; listed: ListedIpo[]; error?: string }> => {
    try {
      const rows = await nsePastIssues();
      const cleaned = rows
        .map((r: any) => {
          const issuePrice = Number(String(r?.issuePrice ?? "").replace(/[^\d.]/g, ""));
          const listingDate = parseNseDate(String(r?.listingDate ?? ""));
          if (!r?.symbol || !listingDate || !Number.isFinite(issuePrice) || issuePrice <= 0) return null;
          const sym = String(r.symbol).toUpperCase();
          // Skip debt / NCD / bond listings: their symbols carry digits and issue prices are ₹1,000+ face value.
          if (/\d/.test(sym) || issuePrice >= 1000) return null;

          return {
            symbol: String(r.symbol).toUpperCase(),
            company: String(r.company ?? r.symbol),
            issuePrice,
            listingDate,
          };
        })
        .filter(Boolean) as Array<{ symbol: string; company: string; issuePrice: number; listingDate: string }>;

      cleaned.sort((a, b) => b.listingDate.localeCompare(a.listingDate));
      const recent = cleaned.slice(0, 30);

      const withPrices = await Promise.all(
        recent.map(async (r) => {
          let { price, dayChangePct } = await yahooPrice(`${r.symbol}.NS`);
          if (price == null) ({ price, dayChangePct } = await yahooPrice(`${r.symbol}.BO`));

          const changeAbs = price != null ? price - r.issuePrice : null;
          const changePct = price != null ? ((price - r.issuePrice) / r.issuePrice) * 100 : null;
          return { ...r, price, changeAbs, changePct, dayChangePct } satisfies ListedIpo;
        }),
      );

      return { ok: true, listed: withPrices };
    } catch (e) {
      return { ok: false, listed: [], error: (e as Error).message };
    }
  },
);
