import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDhanLiveChart, getDhanHoldings as getDhanHoldingsFn } from "./dhan.functions";
import { getDhanQuote } from "./dhan.server";

export type ChartPoint = { t: number; price: number; volume: number };

/**
 * Live chart data re-routed directly to DhanHQ API v2.
 * Groww has been deprecated in favor of DhanHQ.
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
    return await getDhanLiveChart({
      data: {
        symbol: data.growwSymbol,
        dhanSymbol: data.growwSymbol,
        exchange: data.exchange,
        intervalMinutes: data.intervalMinutes,
        days: data.days,
      },
    });
  });

/** Live quote re-routed to DhanHQ v2 */
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
    try {
      const q = await getDhanQuote(data.growwSymbol);
      if (q) return { ok: true as const, quote: q };
      return { ok: false as const, error: "DhanHQ quote not found" };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Status endpoint returning clean API key not configured response */
export const getGrowwStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = Boolean(process.env.GROWW_API_KEY && process.env.GROWW_API_SECRET);
  return {
    ok: true as const,
    status: {
      configured,
      auth: configured ? "connected" : "unconfigured",
      message: configured ? "Groww Trading API connected" : "API key not configured",
    },
  };
});

/** Holdings re-routed to DhanHQ portfolio */
export const getGrowwHoldings = createServerFn({ method: "GET" }).handler(async () => {
  return await getDhanHoldingsFn();
});
