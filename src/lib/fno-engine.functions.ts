import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generateSignal,
  INDIA_FNO_UNIVERSE,
  USA_FNO_UNIVERSE,
  type Signal,
  type OHLC,
} from "./fno-engine";

async function fetchDaily(fullSymbol: string): Promise<{
  prev: OHLC; ltp: number; volume: number; avgVolume: number; htfTrend: "up" | "down" | "flat";
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    fullSymbol,
  )}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const r = j?.chart?.result?.[0];
    if (!r) return null;
    const ts: number[] = r.timestamp ?? [];
    const q = r.indicators?.quote?.[0] ?? {};
    const closes: number[] = q.close ?? [];
    const highs: number[] = q.high ?? [];
    const lows: number[] = q.low ?? [];
    const opens: number[] = q.open ?? [];
    const vols: number[] = q.volume ?? [];
    const meta = r.meta ?? {};
    const bars: OHLC[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (
        typeof closes[i] === "number" &&
        typeof highs[i] === "number" &&
        typeof lows[i] === "number"
      ) {
        bars.push({
          t: ts[i] * 1000,
          open: opens[i] ?? closes[i],
          high: highs[i],
          low: lows[i],
          close: closes[i],
          volume: vols[i] ?? 0,
        });
      }
    }
    if (bars.length < 20) return null;
    const prev = bars[bars.length - 2];
    const cur = bars[bars.length - 1];
    const ltp = Number(meta.regularMarketPrice ?? cur.close);
    const volume = cur.volume;
    const avgVolume =
      bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
    // HTF trend: 20 vs 50 SMA
    const sma = (n: number) =>
      bars.slice(-n).reduce((s, b) => s + b.close, 0) / n;
    const sma20 = sma(20);
    const sma50 = sma(Math.min(50, bars.length));
    const htfTrend: "up" | "down" | "flat" =
      ltp > sma20 && sma20 > sma50 ? "up" :
      ltp < sma20 && sma20 < sma50 ? "down" : "flat";
    return { prev, ltp, volume, avgVolume, htfTrend };
  } catch {
    return null;
  }
}

export const getFnoSignals = createServerFn({ method: "GET" })
  .validator((d) =>
    z.object({ market: z.enum(["india", "usa"]).default("india") }).parse(d),
  )
  .handler(async ({ data }) => {
    const universe = data.market === "india" ? INDIA_FNO_UNIVERSE : USA_FNO_UNIVERSE;
    const signals: Signal[] = [];
    for (const u of universe) {
      const d = await fetchDaily(u.yahoo);
      if (!d) continue;
      const s = generateSignal({
        symbol: u.symbol,
        name: u.name,
        prev: d.prev,
        ltp: d.ltp,
        volume: d.volume,
        avgVolume: d.avgVolume,
        htfTrend: d.htfTrend,
      });
      if (s) signals.push(s);
    }
    // Sort by grade then confidence
    const gradeOrder: Record<string, number> = { "A+": 3, A: 2, Scalp: 1 };
    signals.sort(
      (a, b) => gradeOrder[b.grade] - gradeOrder[a.grade] || b.confidence - a.confidence,
    );
    return { ok: true as const, signals, generatedAt: Date.now() };
  });
