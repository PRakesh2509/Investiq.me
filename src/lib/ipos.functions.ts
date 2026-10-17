import { createServerFn } from "@tanstack/react-start";
import { MANUAL_IPOS, resolveIpoStatus, type IPO } from "./ipos";

// NSE requires a homepage hit first to set cookies before the JSON API responds.
async function nseFetch(path: string): Promise<any> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    // Prime cookies
    const prime = await fetch("https://www.nseindia.com/market-data/all-upcoming-issues-ipo", {
      headers: { "User-Agent": headers["User-Agent"], Accept: "text/html" },
      signal: controller.signal,
    });
    if (!prime.ok) throw new Error(`NSE prime HTTP ${prime.status}`);
    const cookie =
      prime.headers
        .getSetCookie?.()
        ?.map((c) => c.split(";")[0])
        .join("; ") ??
      prime.headers.get("set-cookie")?.split(",").map((c) => c.split(";")[0]).join("; ") ??
      "";
    const res = await fetch(`https://www.nseindia.com${path}`, {
      headers: { ...headers, Cookie: cookie },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`NSE ${path} HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Parse "23-Jul-2026" → ISO YYYY-MM-DD
function parseNseDate(s: string): string {
  if (!s) return "";
  const [d, mon, y] = s.split("-");
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  return `${y}-${months[mon] ?? "01"}-${d.padStart(2, "0")}`;
}

function daysUntil(iso: string): number {
  if (!iso) return NaN;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

function normalize(raw: any, source: "current" | "upcoming"): IPO | null {
  if (!raw?.symbol) return null;
  const open = parseNseDate(raw.issueStartDate);
  const close = parseNseDate(raw.issueEndDate);
  const priceBand = (raw.issuePrice ?? "")
    .replace(/Rs\.?\s*/g, "₹")
    .replace(/\s*to\s*/i, " – ");
  const sizeShares = Number(raw.issueSize ?? 0);
  const issueSize = sizeShares > 0 ? `${(sizeShares / 1e7).toFixed(2)} Cr shares` : "—";
  const dOpen = daysUntil(open);
  const dClose = daysUntil(close);
  let status: IPO["status"];
  if (source === "upcoming" || dOpen > 0) status = "upcoming";
  else if (dClose >= 0) status = "open";
  else status = "closed";
  // T+3 allotment, T+6 listing (SEBI current standard)
  const closeDate = close ? new Date(close) : null;
  const allotment = closeDate ? new Date(closeDate.getTime() + 3 * 86_400_000).toISOString().slice(0, 10) : "";
  const listing = closeDate ? new Date(closeDate.getTime() + 6 * 86_400_000).toISOString().slice(0, 10) : "";
  return {
    id: `nse-${raw.symbol}`,
    company: raw.companyName ?? raw.symbol,
    sector: raw.series === "IV" ? "InvIT / REIT" : "NSE Mainboard",
    priceBand,
    lotSize: 0,
    issueSize,
    openDate: open,
    closeDate: close,
    allotmentDate: allotment,
    listingDate: listing,
    status: resolveIpoStatus({ openDate: open, closeDate: close, allotmentDate: allotment, listingDate: listing, status }),
  };
}

export const getLiveIpos = createServerFn({ method: "GET" }).handler(async (): Promise<{
  ok: boolean;
  ipos: IPO[];
  error?: string;
  source?: "nse" | "curated";
}> => {
  const baseIpos: IPO[] = MANUAL_IPOS.map((m) => ({ ...m, status: resolveIpoStatus(m) }));
  try {
    const [current, upcoming] = await Promise.all([
      nseFetch("/api/ipo-current-issue").catch(() => []),
      nseFetch("/api/all-upcoming-issues?category=ipo").catch(() => []),
    ]);
    const curArr = Array.isArray(current) ? current.filter((x: any) => !x.category || x.category === "Total") : [];
    const upArr = Array.isArray(upcoming) ? upcoming : [];

    if (curArr.length === 0 && upArr.length === 0) {
      return { ok: true, ipos: baseIpos, source: "curated" };
    }

    const seen = new Set<string>();
    const out: IPO[] = [];
    const norm = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|private|pvt)\b|[^a-z0-9]/g, "");

    for (const r of curArr) {
      const n = normalize(r, "current");
      if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); }
    }
    for (const r of upArr) {
      const n = normalize(r, "upcoming");
      if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); }
    }

    const outNames = new Set(out.map((o) => norm(o.company)));
    for (const b of baseIpos) {
      if (!outNames.has(norm(b.company)) && !seen.has(b.id)) {
        out.push(b);
      }
    }
    return { ok: true, ipos: out.length > 0 ? out : baseIpos, source: "nse" };
  } catch (e) {
    return { ok: true, ipos: baseIpos, source: "curated", error: (e as Error).message };
  }
});
