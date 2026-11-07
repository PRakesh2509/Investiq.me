import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDhanChartCandles } from "./dhan.server.ts";
import { fetchDhanQuotes } from "./dhan-quotes.server.ts";
import { NIFTY_UNIVERSE, NiftyStock } from "./nifty-universe";
import {
  TtlCache,
  classifyFreshness,
  isAllowedInterval,
  isAllowedRange,
  isMarketOpenAt,
  isValidSymbol,
  parseSymbolList,
  type FreshnessStatus,
} from "./provider-utils.ts";

export interface LiveStockQuote {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  high52: number;
  low52: number;
  week52Available: boolean;
  feedSource: string;
  freshnessStatus: FreshnessStatus;
}

const quoteCache = new TtlCache<{ quotes: LiveStockQuote[]; feedSource: string }>(10);
const round2 = (n: number) => +n.toFixed(2);

/**
 * 100% Dhan-backed stock quotes for the Nifty universe or an arbitrary symbol list.
 */
export const getIndianStockQuotes = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        symbols: z.string().max(4000).optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }) => {
    const rawSymbols = data?.symbols ? parseSymbolList(data.symbols, 120) : [];
    const isUniverse = rawSymbols.length === 0;
    const targetUniverse: NiftyStock[] = isUniverse
      ? NIFTY_UNIVERSE
      : rawSymbols.map((s) => {
        const clean = s.replace(/\.NS$/i, "").toUpperCase();
        const match = NIFTY_UNIVERSE.find((u) => u.symbol === clean);
        return match ?? { symbol: clean, name: clean, sector: "Other" };
      });

    const now = Date.now();
    const marketOpen = isMarketOpenAt(new Date(now), false);
    const ttlMs = marketOpen ? 10_000 : 60_000;
    const cacheKey = isUniverse ? "__UNIVERSE__" : targetUniverse.map((s) => s.symbol).sort().join(",");

    const hit = quoteCache.get(cacheKey, ttlMs);
    if (hit) {
      return {
        ok: true,
        quotes: hit.quotes,
        feedSource: hit.feedSource,
        isSimulated: false,
        freshnessStatus: marketOpen ? ("LIVE" as FreshnessStatus) : ("MARKET_CLOSED" as FreshnessStatus),
      };
    }

    try {
      const symbolsToFetch = targetUniverse.map((u) => u.symbol);
      const dhanQuotes = await fetchDhanQuotes(symbolsToFetch);
      const quotes: LiveStockQuote[] = [];

      for (let i = 0; i < targetUniverse.length; i++) {
        const item = targetUniverse[i];
        const q = dhanQuotes[i];
        if (q && q.price > 0) {
          quotes.push({
            symbol: item.symbol,
            name: item.name,
            sector: item.sector,
            price: round2(q.price),
            change: round2(q.change),
            changePct: round2(q.changePct),
            open: round2(q.open),
            high: round2(q.high),
            low: round2(q.low),
            prevClose: round2(q.prevClose),
            volume: q.volume,
            high52: q.high52 ?? 0,
            low52: q.low52 ?? 0,
            week52Available: q.high52 !== undefined,
            feedSource: "DhanHQ Live Direct Feed",
            freshnessStatus: marketOpen ? "LIVE" : "MARKET_CLOSED",
          });
        }
      }

      if (quotes.length > 0) {
        const payload = { quotes, feedSource: "DhanHQ Live Direct Feed" };
        quoteCache.set(cacheKey, payload);
        return {
          ok: true,
          ...payload,
          isSimulated: false,
          freshnessStatus: marketOpen ? ("LIVE" as FreshnessStatus) : ("MARKET_CLOSED" as FreshnessStatus),
        };
      }
    } catch {
      // ignore
    }

    const stale = quoteCache.getStale(cacheKey, 24 * 3600_000);
    if (stale) {
      return {
        ok: true,
        quotes: stale.value.quotes,
        feedSource: "DhanHQ Marketfeed (Cached)",
        isSimulated: false,
        freshnessStatus: marketOpen ? ("STALE" as FreshnessStatus) : ("MARKET_CLOSED" as FreshnessStatus),
      };
    }

    return {
      ok: false,
      quotes: [],
      feedSource: "DhanHQ",
      error: "Not available from Dhan",
    };
  });

export interface StockChartPoint {
  t: string;
  fullTime: string;
  price: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
  timestamp: number;
}

export interface StockChartMeta {
  open: number;
  dayHigh: number;
  dayLow: number;
  regularMarketVolume: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketPrice?: number;
  previousClose?: number;
  currency?: string;
}

export const getLiveStockChart = createServerFn({ method: "GET" })
  .validator((d) =>
    z
      .object({
        symbol: z.string().min(1).max(32).refine(isValidSymbol, "Invalid symbol"),
        range: z.string().refine(isAllowedRange, "Unsupported range").default("1d"),
        interval: z.string().refine(isAllowedInterval, "Unsupported interval").default("5m"),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      points: StockChartPoint[];
      meta?: StockChartMeta;
      feedSource: string;
      isSimulated?: boolean;
    }> => {
      const cleanSym = data.symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").replace(/^\^/, "").toUpperCase();

      try {
        const intervalMins =
          data.interval === "1m"
            ? 1
            : data.interval === "15m"
              ? 15
              : data.interval === "60m" || data.interval === "1h"
                ? 60
                : data.interval === "1d"
                  ? 1440
                  : 5;

        const dhanCandles = await getDhanChartCandles(cleanSym, data.range, intervalMins);
        if (dhanCandles && dhanCandles.length > 0) {
          const is1d = data.range === "1d";
          const is5d = data.range === "5d";
          const points: StockChartPoint[] = dhanCandles.map((c) => {
            const d = new Date(c.t);
            const t = is1d
              ? d.toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
              : is5d
                ? d.toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
                : d.toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  ...(data.range === "5y" || data.range === "max" ? { year: "numeric" } : {}),
                });
            const fullTime =
              d.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              }) + " IST";
            return {
              t,
              fullTime,
              price: round2(c.price),
              volume: c.volume,
              open: round2(c.open),
              high: round2(c.high),
              low: round2(c.low),
              timestamp: d.getTime(),
            };
          });
          const chartMeta: StockChartMeta = {
            open: round2(dhanCandles[0].open),
            dayHigh: round2(Math.max(...dhanCandles.map((c) => c.high))),
            dayLow: round2(Math.min(...dhanCandles.map((c) => c.low))),
            regularMarketVolume: dhanCandles.reduce((s, c) => s + c.volume, 0),
            regularMarketPrice: points[points.length - 1]?.price ?? 0,
            previousClose: points[0]?.price ?? 0,
            currency: "INR",
          };
          return { ok: true, points, meta: chartMeta, feedSource: "DhanHQ Historical", isSimulated: false };
        }
      } catch {
        // ignore
      }

      return {
        ok: false,
        points: [],
        feedSource: "DhanHQ",
        isSimulated: false,
      };
    },
  );
