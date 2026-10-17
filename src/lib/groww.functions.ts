import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ChartPoint = { t: number; price: number; volume: number };

/**
 * Live chart data sourced exclusively from the Groww Trading API.
 * No third-party fallback — if Groww has no data we report the error.
 */
export const getLiveChart = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        growwSymbol: z.string().min(1),
        exchange: z.enum(["NSE", "BSE"]).default("NSE"),
        segment: z.enum(["CASH", "FNO"]).default("CASH"),
        intervalMinutes: z.number().int().min(1).max(1440).default(5),
        days: z.number().int().min(1).max(120).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { growwCandles, growwQuote } = await import("@/lib/groww.server");
    try {
      const end = Date.now();
      const start = end - data.days * 86400_000;
      const [candles, quote] = await Promise.all([
        growwCandles({
          tradingSymbol: data.growwSymbol,
          exchange: data.exchange,
          segment: data.segment,
          start,
          end,
          intervalMinutes: data.intervalMinutes,
        }),
        growwQuote(data.growwSymbol, data.exchange, data.segment).catch(() => null),
      ]);
      if (!candles.length) {
        return { ok: false as const, error: "Groww returned no candles for this interval" };
      }
      const points: ChartPoint[] = candles.map((c) => ({
        t: c.time * 1000,
        price: c.close,
        volume: c.volume,
      }));
      return {
        ok: true as const,
        source: "groww" as const,
        points,
        previousClose:
          quote?.prevClose ?? points[0]?.price ?? points[points.length - 1]?.price ?? 0,
      };
    } catch (e) {
      console.warn("[groww chart]", (e as Error).message);
      return { ok: false as const, error: (e as Error).message };
    }
  });


/** Live quote for a Groww trading symbol (with Yahoo fallback). */
export const getGrowwQuote = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        growwSymbol: z.string().min(1),
        exchange: z.enum(["NSE", "BSE"]).default("NSE"),
        segment: z.enum(["CASH", "FNO"]).default("CASH"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { growwQuote } = await import("@/lib/groww.server");
    try {
      return { ok: true as const, quote: await growwQuote(data.growwSymbol, data.exchange, data.segment) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Groww connection / role health, used by the admin panel. */
export const getGrowwStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { growwStatus } = await import("@/lib/groww.server");
  try {
    return { ok: true as const, status: await growwStatus() };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});
