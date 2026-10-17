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

function parseDdMmYyyy(s: string): Date {
  const [d, m, y] = s.split("-");
  return new Date(`${y}-${m}-${d}`);
}

function annualized(final: number, start: number, years: number): number {
  if (start <= 0 || years <= 0) return 0;
  return (Math.pow(final / start, 1 / years) - 1) * 100;
}

function findByDaysBack(pts: NavPoint[], days: number): NavPoint | undefined {
  if (pts.length === 0) return undefined;
  const latest = parseDdMmYyyy(pts[pts.length - 1].date).getTime();
  const target = latest - days * 86_400_000;
  // pts is ascending
  let best = pts[0];
  for (const p of pts) {
    if (parseDdMmYyyy(p.date).getTime() <= target) best = p;
    else break;
  }
  return best;
}

export const getFundData = createServerFn({ method: "GET" })
  .validator((d: unknown): { schemeCode: string } => {
    const s = (d as { schemeCode?: unknown })?.schemeCode;
    if (typeof s !== "string" || !s) throw new Error("schemeCode required");
    return { schemeCode: s };
  })
  .handler(async ({ data }): Promise<FundLiveData> => {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${data.schemeCode}`, {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
      });
      if (!res.ok) throw new Error(`mfapi HTTP ${res.status}`);
      const json = (await res.json()) as {
        meta?: { scheme_name?: string; fund_house?: string };
        data?: Array<{ date: string; nav: string }>;
      };
      const raw = json.data ?? [];
      if (raw.length === 0) throw new Error("No NAV data");
      // Ascending order (mfapi returns newest first)
      const asc = raw.slice().reverse().map((r) => ({ date: r.date, nav: Number(r.nav) })).filter((p) => p.nav > 0);
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
        schemeCode: data.schemeCode,
        schemeName: json.meta?.scheme_name,
        fundHouse: json.meta?.fund_house,
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
    } catch (e) {
      return {
        ok: false,
        schemeCode: data.schemeCode,
        history: [],
        error: (e as Error).message,
      };
    }
  });
