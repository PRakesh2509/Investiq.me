import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aggregateBars, getInstrumentBars } from "./market-data-provider.server.ts";
import { isValidSymbol, type FreshnessStatus } from "./provider-utils.ts";

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TfConfig {
  interval: string;
  range: string;
  factor?: number;
  dhanRange?: string;
  dhanMinutes?: number;
}

const TF_MAP: Record<string, TfConfig> = {
  "1M": { interval: "1m", range: "1d", dhanRange: "1d", dhanMinutes: 1 },
  "3M": { interval: "1m", range: "2d", factor: 3 },
  "5M": { interval: "5m", range: "5d", dhanRange: "5d", dhanMinutes: 5 },
  "15M": { interval: "15m", range: "1mo", dhanRange: "5d", dhanMinutes: 15 },
  "30M": { interval: "30m", range: "1mo" },
  "1H": { interval: "60m", range: "3mo", dhanRange: "1mo", dhanMinutes: 60 },
  "4H": { interval: "60m", range: "1y", factor: 4 },
  "1D": { interval: "1d", range: "2y", dhanRange: "1y" },
};

/** Provenance returned alongside the bars so the UI can badge them. */
interface BarsProvenance {
  isSimulated: boolean;
  dataSource: string;
  freshnessStatus: FreshnessStatus;
  asOf?: number;
}

export const getBars = createServerFn({ method: "GET" })
  .validator((d) =>
    z
      .object({
        symbol: z.string().min(1).max(32).refine(isValidSymbol, { message: "Invalid symbol" }),
        timeframe: z.enum(["1M", "3M", "5M", "15M", "30M", "1H", "4H", "1D"]).default("5M"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const isIndian =
      data.symbol.startsWith("^NSE") ||
      data.symbol.includes("NIFTY") ||
      data.symbol.includes("SENSEX") ||
      data.symbol.endsWith(".NS");
    const tf = TF_MAP[data.timeframe] ?? TF_MAP["5M"];
    const cleanSym = data.symbol.replace(/\^/g, "").replace(/\.NS$/i, "");

    // DhanHQ first for Indian instruments, then Yahoo Finance; both go through the cached,
    // retried provider layer. Bars are never generated.
    const result = await getInstrumentBars({
      yahooSymbol: data.symbol,
      interval: tf.interval,
      range: tf.range,
      isGlobal: !isIndian,
      dhan:
        isIndian && tf.dhanRange
          ? { symbol: cleanSym, range: tf.dhanRange, minutes: tf.dhanMinutes }
          : undefined,
    });

    if (!result || result.bars.length === 0) {
      return { ok: false as const, error: "no market data available" };
    }

    const provenance: BarsProvenance = {
      isSimulated: false,
      dataSource: result.source,
      freshnessStatus: result.freshnessStatus,
      asOf: result.asOfMs,
    };
    const bars: Bar[] = tf.factor ? aggregateBars(result.bars, tf.factor) : result.bars;
    const last = bars[bars.length - 1];
    return {
      ok: true as const,
      bars,
      price: result.source === "dhan" ? (last?.close ?? 0) : result.price,
      prevClose: result.prevClose,
      currency: result.currency,
      source: (result.source === "dhan" ? "dhan" : "feed") as "dhan" | "feed",
      ...provenance,
    };
  });
