import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generateSignal,
  INDIA_FNO_UNIVERSE,
  USA_FNO_UNIVERSE,
  type Signal,
  type OHLC,
} from "./fno-engine";
import { fetchYahooChart } from "./market-data-provider.server.ts";

async function fetchDaily(fullSymbol: string): Promise<{
  prev: OHLC;
  ltp: number;
  volume: number;
  avgVolume: number;
  htfTrend: "up" | "down" | "flat";
} | null> {
  const r = await fetchYahooChart(fullSymbol, "1d", "3mo");
  if (!r) return null;
  const bars: OHLC[] = r.chart.bars.map((b) => ({
    t: b.time * 1000,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  if (bars.length < 20) return null;
  const prev = bars[bars.length - 2];
  const cur = bars[bars.length - 1];
  const ltp = Number(r.chart.meta.regularMarketPrice ?? cur.close);
  const volume = cur.volume;
  const avgVolume = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
  // HTF trend: 20 vs 50 SMA
  const sma = (n: number) => bars.slice(-n).reduce((s, b) => s + b.close, 0) / n;
  const sma20 = sma(20);
  const sma50 = sma(Math.min(50, bars.length));
  const htfTrend: "up" | "down" | "flat" =
    ltp > sma20 && sma20 > sma50 ? "up" : ltp < sma20 && sma20 < sma50 ? "down" : "flat";
  return { prev, ltp, volume, avgVolume, htfTrend };
}

export const getFnoSignals = createServerFn({ method: "GET" })
  .validator((d) => z.object({ market: z.enum(["india", "usa"]).default("india") }).parse(d))
  .handler(async ({ data }) => {
    const universe = data.market === "india" ? INDIA_FNO_UNIVERSE : USA_FNO_UNIVERSE;
    const signals: Signal[] = [];
    // Bounded parallelism: the provider layer caches per symbol, so repeat calls are cheap.
    const CHUNK = 6;
    for (let i = 0; i < universe.length; i += CHUNK) {
      const batch = universe.slice(i, i + CHUNK);
      const daily = await Promise.all(batch.map((u) => fetchDaily(u.yahoo)));
      batch.forEach((u, idx) => {
        const d = daily[idx];
        if (!d) return;
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
      });
    }
    // Sort by grade then confidence
    const gradeOrder: Record<string, number> = { "A+": 3, A: 2, Scalp: 1 };
    signals.sort(
      (a, b) => gradeOrder[b.grade] - gradeOrder[a.grade] || b.confidence - a.confidence,
    );
    return { ok: true as const, signals, generatedAt: Date.now() };
  });
