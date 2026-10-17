import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TF_MAP: Record<string, { interval: string; range: string }> = {
  "1M": { interval: "1m", range: "1d" },
  "5M": { interval: "5m", range: "5d" },
  "15M": { interval: "15m", range: "1mo" },
  "1H": { interval: "60m", range: "3mo" },
  "4H": { interval: "60m", range: "1y" },
  "1D": { interval: "1d", range: "2y" },
};

export const getBars = createServerFn({ method: "GET" })
  .validator((d) =>
    z
      .object({
        symbol: z.string(),
        timeframe: z.enum(["1M", "5M", "15M", "1H", "4H", "1D"]).default("5M"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { interval, range } = TF_MAP[data.timeframe];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      data.symbol,
    )}?interval=${interval}&range=${range}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
      });
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      const j = (await res.json()) as any;
      const r = j?.chart?.result?.[0];
      if (!r) return { ok: false as const, error: "no result" };
      const ts: number[] = r.timestamp ?? [];
      const q = r.indicators?.quote?.[0] ?? {};
      const meta = r.meta ?? {};
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (
          typeof o === "number" && typeof h === "number" &&
          typeof l === "number" && typeof c === "number"
        ) {
          bars.push({
            time: ts[i],
            open: o, high: h, low: l, close: c,
            volume: q.volume?.[i] ?? 0,
          });
        }
      }
      // Aggregate to 4H
      let out = bars;
      if (data.timeframe === "4H") {
        out = aggregate(bars, 4);
      }
      const price = Number(meta.regularMarketPrice ?? bars[bars.length - 1]?.close ?? 0);
      const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? bars[0]?.close ?? price);
      return {
        ok: true as const,
        bars: out,
        price,
        prevClose,
        currency: meta.currency ?? "USD",
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "fetch failed" };
    }
  });

function aggregate(bars: Bar[], factor: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const slice = bars.slice(i, i + factor);
    if (!slice.length) continue;
    out.push({
      time: slice[0].time,
      open: slice[0].open,
      high: Math.max(...slice.map((b) => b.high)),
      low: Math.min(...slice.map((b) => b.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((s, b) => s + b.volume, 0),
    });
  }
  return out;
}
