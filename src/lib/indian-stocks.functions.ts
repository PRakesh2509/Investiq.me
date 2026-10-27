import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDhanOhlc, getDhanChartCandles, getDhanCredentials } from "./dhan.server.ts";
import { fetchYahooChart, getInstrumentQuote } from "./market-data-provider.server.ts";
import { NIFTY_UNIVERSE, NiftyStock } from "./nifty-universe";
import {
  TtlCache,
  classifyFreshness,
  isAllowedYahooInterval,
  isAllowedYahooRange,
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
  /** 0 when `week52Available` is false (the DhanHQ feed carries no 52-week range). */
  high52: number;
  low52: number;
  feedSource: "DhanHQ Live" | "NSE Live";
  /** Optional provenance. */
  week52Available?: boolean;
  freshnessStatus?: FreshnessStatus;
}

// Small bounded TTL cache (keyed by the requested symbol set) to keep prices snappy and avoid
// upstream rate limits. Best-effort only: Workers isolates are recycled at any time.
const QUOTE_TTL_MS = 10_000;
const quoteCache = new TtlCache<{ quotes: LiveStockQuote[]; feedSource: string }>(20);

const round2 = (n: number) => +n.toFixed(2);

export const getIndianStockQuotes = createServerFn({ method: "POST" })
  .validator((d) => z.object({ symbols: z.string().max(4000).optional() }).parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      quotes: LiveStockQuote[];
      feedSource: string;
      isSimulated?: boolean;
      freshnessStatus?: FreshnessStatus;
    }> => {
      const symbols = parseSymbolList(data?.symbols, 150).map((s) =>
        s.toUpperCase().replace(/\.NS$/i, ""),
      );
      const cacheKey = symbols.length > 0 ? [...symbols].sort().join(",") : "*";

      const cached = quoteCache.get(cacheKey, QUOTE_TTL_MS);
      if (cached && cached.quotes.length > 0) {
        return { ok: true, ...cached, isSimulated: false };
      }

      const targetList: NiftyStock[] =
        symbols.length > 0
          ? symbols.map(
              (s) =>
                NIFTY_UNIVERSE.find((u) => u.symbol === s) ?? {
                  symbol: s,
                  name: s,
                  sector: "Other",
                },
            )
          : NIFTY_UNIVERSE;

      const now = Date.now();
      const marketOpen = isMarketOpenAt(new Date(now), false);

      // 1. DhanHQ first (authorized broker feed)
      const dhanCreds = getDhanCredentials();
      if (dhanCreds) {
        try {
          const dhanOhlcMap = await getDhanOhlc(targetList.map((s) => s.symbol));
          if (dhanOhlcMap && Object.keys(dhanOhlcMap).length > 0) {
            const freshnessStatus = classifyFreshness({
              asOfMs: now,
              nowMs: now,
              marketOpen,
              feed: "realtime",
            });
            const quotes: LiveStockQuote[] = [];
            for (const item of targetList) {
              const d = dhanOhlcMap[item.symbol];
              if (d && d.price > 0) {
                const prevClose = d.close > 0 ? d.close : d.open;
                const change = round2(d.price - prevClose);
                const changePct = prevClose > 0 ? round2((change / prevClose) * 100) : 0;
                quotes.push({
                  symbol: item.symbol,
                  name: item.name,
                  sector: item.sector,
                  price: round2(d.price),
                  change,
                  changePct,
                  open: round2(d.open),
                  high: round2(d.high),
                  low: round2(d.low),
                  prevClose: round2(prevClose),
                  volume: d.volume,
                  high52: 0,
                  low52: 0,
                  week52Available: false,
                  feedSource: "DhanHQ Live",
                  freshnessStatus,
                });
              }
            }
            if (quotes.length > 0) {
              const payload = { quotes, feedSource: "DhanHQ Live Feed" };
              quoteCache.set(cacheKey, payload);
              return { ok: true, ...payload, isSimulated: false, freshnessStatus };
            }
          }
        } catch {
          /* fall through to Yahoo Finance */
        }
      }

      // 2. Yahoo Finance fallback (delayed), fetched in small parallel batches
      const fetchOne = async (item: NiftyStock): Promise<LiveStockQuote | null> => {
        const q = await getInstrumentQuote({ yahooSymbol: `${item.symbol}.NS` });
        if (!q || q.price <= 0) return null;
        return {
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          open: q.open,
          high: q.high,
          low: q.low,
          prevClose: q.prevClose,
          volume: q.volume,
          high52: q.high52 ?? 0,
          low52: q.low52 ?? 0,
          week52Available: q.high52 !== undefined && q.low52 !== undefined,
          feedSource: "NSE Live",
          freshnessStatus: q.freshnessStatus,
        };
      };

      const results: LiveStockQuote[] = [];
      const CHUNK_SIZE = 15;
      for (let i = 0; i < targetList.length; i += CHUNK_SIZE) {
        const batch = targetList.slice(i, i + CHUNK_SIZE);
        const batchRes = await Promise.all(batch.map(fetchOne));
        for (const q of batchRes) {
          if (q) results.push(q);
        }
      }

      const freshnessStatus = results[0]?.freshnessStatus;
      if (results.length > 0) {
        quoteCache.set(cacheKey, { quotes: results, feedSource: "NSE Live Feed" });
      }

      return {
        ok: true,
        quotes: results,
        feedSource: dhanCreds ? "DhanHQ Live Feed" : "NSE Live Feed",
        isSimulated: false,
        freshnessStatus,
      };
    },
  );

export interface StockChartPoint {
  t: string;
  price: number;
  volume: number;
  open: number;
  high: number;
  low: number;
}

export const getLiveStockChart = createServerFn({ method: "GET" })
  .validator((d) =>
    z
      .object({
        symbol: z.string().min(1).max(32).refine(isValidSymbol, "Invalid symbol"),
        range: z.string().refine(isAllowedYahooRange, "Unsupported range").default("1d"),
        interval: z.string().refine(isAllowedYahooInterval, "Unsupported interval").default("5m"),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      points: StockChartPoint[];
      feedSource: string;
      isSimulated?: boolean;
    }> => {
      const cleanSym = data.symbol.replace(/\.NS$/i, "").toUpperCase();

      // 1. DhanHQ Charts if credentials are configured
      const dhanCreds = getDhanCredentials();
      if (dhanCreds) {
        try {
          const dhanCandles = await getDhanChartCandles(cleanSym, data.range);
          if (dhanCandles && dhanCandles.length > 0) {
            const points: StockChartPoint[] = dhanCandles.map((c) => ({
              t: new Date(c.t).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
              price: round2(c.price),
              volume: c.volume,
              open: round2(c.open),
              high: round2(c.high),
              low: round2(c.low),
            }));
            return { ok: true, points, feedSource: "DhanHQ Historical", isSimulated: false };
          }
        } catch {
          /* fall through to Yahoo Finance */
        }
      }

      // 2. Fallback to Yahoo Finance Chart
      const r = await fetchYahooChart(`${cleanSym}.NS`, data.interval, data.range);
      if (r) {
        const { bars, points: closes } = r.chart;
        const byTime = new Map(bars.map((b) => [b.time, b]));
        const intraday = data.range === "1d" || data.range === "5d";
        const points: StockChartPoint[] = closes.map((p) => {
          const b = byTime.get(p.time);
          return {
            t: new Date(p.time * 1000).toLocaleString("en-IN", {
              ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
              day: "2-digit",
              month: "short",
              ...(data.range === "5y" || data.range === "max" ? { year: "numeric" } : {}),
            }),
            price: round2(p.close),
            volume: p.volume,
            open: round2(b?.open ?? p.close),
            high: round2(b?.high ?? p.close),
            low: round2(b?.low ?? p.close),
          };
        });
        return { ok: true, points, feedSource: "NSE Live Feed", isSimulated: false };
      }

      return { ok: false, points: [], feedSource: "Unavailable", isSimulated: false };
    },
  );
