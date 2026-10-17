import { createServerFn } from "@tanstack/react-start";

// mfapi.in returns: { meta:{scheme_name, fund_house,...}, data:[{date:"dd-mm-yyyy", nav:"12.34"}, ...] }
export interface NavPoint { date: string; nav: number }
export interface FundLiveData {
  ok: boolean;
  schemeCode: string;
  schemeName?: string;
  fundHouse?: string;
  currentNav?: number;
  currentDate?: string;   // dd-mm-yyyy
  prevNav?: number;
  changeAbs?: number;
  changePct?: number;
  return1m?: number;
  return3m?: number;
  return1y?: number;
  return3y?: number;      // annualized
  return5y?: number;      // annualized
  return10y?: number;     // annualized
  returnAll?: number;     // annualized since inception
  history: NavPoint[];    // downsampled full history, oldest → newest
  error?: string;
}

export function parseDdMmYyyy(s: string): Date {
  const [d, m, y] = s.split("-");
  return new Date(`${y}-${m}-${d}`);
}

export function annualized(final: number, start: number, years: number): number {
  if (start <= 0 || years <= 0) return 0;
  return (Math.pow(final / start, 1 / years) - 1) * 100;
}

export function findByDaysBack(pts: NavPoint[], days: number): NavPoint | undefined {
  if (pts.length === 0) return undefined;
  const latest = parseDdMmYyyy(pts[pts.length - 1].date).getTime();
  const target = latest - days * 86_400_000;
  let best = pts[0];
  for (const p of pts) {
    if (parseDdMmYyyy(p.date).getTime() <= target) best = p;
    else break;
  }
  return best;
}

export function parseMfApiResponse(json: any, schemeCode: string): FundLiveData {
  const raw: Array<{ date: string; nav: string }> = json?.data ?? [];
  if (raw.length === 0) throw new Error("No NAV data in response");

  // Ascending order (mfapi returns newest first)
  const asc = raw.slice().reverse().map((r) => ({ date: r.date, nav: Number(r.nav) })).filter((p) => p.nav > 0);
  if (asc.length === 0) throw new Error("Invalid NAV data");

  const latest = asc[asc.length - 1];
  const prev = asc[asc.length - 2];
  const first = asc[0];

  const p1m = findByDaysBack(asc, 30);
  const p3m = findByDaysBack(asc, 91);
  const p1y = findByDaysBack(asc, 365);
  const p3y = findByDaysBack(asc, 3 * 365);
  const p5y = findByDaysBack(asc, 5 * 365);
  const p10y = findByDaysBack(asc, 10 * 365);

  const yearsAll = (parseDdMmYyyy(latest.date).getTime() - parseDdMmYyyy(first.date).getTime()) / (365 * 86_400_000);

  // Downsample: cap at ~1500 points
  const step = Math.max(1, Math.floor(asc.length / 1500));
  const history = asc.filter((_, i) => i % step === 0);
  if (history[history.length - 1]?.date !== latest.date) history.push(latest);

  return {
    ok: true,
    schemeCode,
    schemeName: json?.meta?.scheme_name,
    fundHouse: json?.meta?.fund_house,
    currentNav: latest.nav,
    currentDate: latest.date,
    prevNav: prev?.nav,
    changeAbs: prev ? +(latest.nav - prev.nav).toFixed(4) : undefined,
    changePct: prev ? +(((latest.nav - prev.nav) / prev.nav) * 100).toFixed(2) : undefined,
    return1m: p1m ? +(((latest.nav - p1m.nav) / p1m.nav) * 100).toFixed(2) : undefined,
    return3m: p3m ? +(((latest.nav - p3m.nav) / p3m.nav) * 100).toFixed(2) : undefined,
    return1y: p1y ? +(((latest.nav - p1y.nav) / p1y.nav) * 100).toFixed(2) : undefined,
    return3y: p3y ? +annualized(latest.nav, p3y.nav, 3).toFixed(2) : undefined,
    return5y: p5y ? +annualized(latest.nav, p5y.nav, 5).toFixed(2) : undefined,
    return10y: p10y ? +annualized(latest.nav, p10y.nav, 10).toFixed(2) : undefined,
    returnAll: yearsAll > 0.5 ? +annualized(latest.nav, first.nav, yearsAll).toFixed(2) : undefined,
    history,
  };
}

const fundCache = new Map<string, { time: number; data: FundLiveData }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const getFundData = createServerFn({ method: "GET" })
  .validator((d: unknown): { schemeCode: string } => {
    const s = (d as { schemeCode?: unknown })?.schemeCode;
    if (typeof s !== "string" || !s) throw new Error("schemeCode required");
    return { schemeCode: s };
  })
  .handler(async ({ data }): Promise<FundLiveData> => {
    const cached = fundCache.get(data.schemeCode);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(`https://api.mfapi.in/mf/${data.schemeCode}`, {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`mfapi HTTP ${res.status}`);
      const json = await res.json();
      const parsed = parseMfApiResponse(json, data.schemeCode);
      fundCache.set(data.schemeCode, { time: Date.now(), data: parsed });
      return parsed;
    } catch (e) {
      if (cached) return cached.data;
      return {
        ok: false,
        schemeCode: data.schemeCode,
        history: [],
        error: (e as Error).message,
      };
    }
  });
