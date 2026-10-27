import { createServerFn } from "@tanstack/react-start";
import {
  calculateListingScenarios,
  computeIpoScore,
  resolveIpoStatus,
  VERIFIED_IPOS,
  type IPO,
} from "./ipos";

// NSE requires a homepage hit first to set cookies before the JSON API responds.
async function nseFetch(path: string): Promise<any> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
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
      prime.headers
        .get("set-cookie")
        ?.split(",")
        .map((c) => c.split(";")[0])
        .join("; ") ??
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
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  return `${y}-${months[mon] ?? "01"}-${(d || "01").padStart(2, "0")}`;
}

export const getLiveIpos = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    ok: boolean;
    ipos: IPO[];
    error?: string;
    source?: "nse" | "curated";
  }> => {
    const baseIpos: IPO[] = VERIFIED_IPOS.map((m) => ({ ...m, status: resolveIpoStatus(m) }));

    try {
      const [current, upcoming] = await Promise.all([
        nseFetch("/api/ipo-current-issue").catch(() => []),
        nseFetch("/api/all-upcoming-issues?category=ipo").catch(() => []),
      ]);

      const curArr = Array.isArray(current)
        ? current.filter((x: any) => !x.category || x.category === "Total")
        : [];
      const upArr = Array.isArray(upcoming) ? upcoming : [];

      if (curArr.length === 0 && upArr.length === 0) {
        return { ok: true, ipos: baseIpos, source: "curated" };
      }

      // Merge live subscription ticks from NSE onto base verified IPOs
      const liveMap = new Map<string, any>();
      for (const item of [...curArr, ...upArr]) {
        if (item.symbol) {
          liveMap.set(item.symbol.toUpperCase(), item);
        }
      }

      const merged = baseIpos.map((base) => {
        const live = liveMap.get(base.symbol.toUpperCase());
        if (!live) return base;

        // If NSE provides live subscription multiples
        const subMultiple = Number(live.noOfTime ?? 0);
        const sub: typeof base.subscription = { ...base.subscription };
        if (subMultiple > 0) {
          sub.total = +subMultiple.toFixed(2);
          sub.updatedAt = "Live NSE Ticks Feed";
        }

        const open = parseNseDate(live.issueStartDate) || base.openDate;
        const close = parseNseDate(live.issueEndDate) || base.closeDate;
        const resolvedStatus = resolveIpoStatus({
          openDate: open,
          closeDate: close,
          allotmentDate: base.allotmentDate,
          listingDate: base.listingDate,
          status: base.status,
        });

        return {
          ...base,
          openDate: open,
          closeDate: close,
          status: resolvedStatus,
          subscription: sub,
        };
      });

      return { ok: true, ipos: merged, source: "nse" };
    } catch {
      return { ok: true, ipos: baseIpos, source: "curated" };
    }
  },
);
