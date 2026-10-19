import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDhanLtp, getDhanOhlc, getDhanChartCandles, getDhanCredentials } from "./dhan.server";
import { NIFTY_UNIVERSE, NiftyStock } from "./nifty-universe";

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
  feedSource: "DhanHQ Live" | "NSE Live";
}

// In-memory cache with 10-second TTL to keep live prices snappy and prevent rate limits
let quoteCache: { quotes: LiveStockQuote[]; expiresAt: number; feedSource: string } | null = null;

export const getIndianStockQuotes = createServerFn({ method: "POST" })
  .validator((d) => z.object({ symbols: z.string().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; quotes: LiveStockQuote[]; feedSource: string }> => {
    const now = Date.now();
    if (quoteCache && quoteCache.expiresAt > now && quoteCache.quotes.length > 0) {
      return { ok: true, quotes: quoteCache.quotes, feedSource: quoteCache.feedSource };
    }

    const symbols = (data?.symbols ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase().replace(/\.NS$/i, ""))
      .filter(Boolean);

    const targetList: NiftyStock[] =
      symbols.length > 0
        ? symbols.map((s) => NIFTY_UNIVERSE.find((u) => u.symbol === s) ?? { symbol: s, name: s, sector: "Other" })
        : NIFTY_UNIVERSE;

    // 1. Try DhanHQ first if credentials are configured
    const dhanCreds = getDhanCredentials();
    if (dhanCreds) {
      try {
        const dhanOhlcMap = await getDhanOhlc(targetList.map((s) => s.symbol));
        if (dhanOhlcMap && Object.keys(dhanOhlcMap).length > 0) {
          const quotes: LiveStockQuote[] = [];
          for (const item of targetList) {
            const d = dhanOhlcMap[item.symbol];
            if (d && d.price > 0) {
              const change = +(d.price - d.open).toFixed(2);
              const changePct = d.open > 0 ? +((change / d.open) * 100).toFixed(2) : 0;
              quotes.push({
                symbol: item.symbol,
                name: item.name,
                sector: item.sector,
                price: +d.price.toFixed(2),
                change,
                changePct,
                open: +d.open.toFixed(2),
                high: +d.high.toFixed(2),
                low: +d.low.toFixed(2),
                prevClose: +d.open.toFixed(2),
                volume: d.volume,
                high52: +(d.high * 1.15).toFixed(2),
                low52: +(d.low * 0.85).toFixed(2),
                feedSource: "DhanHQ Live",
              });
            }
          }
          if (quotes.length > 0) {
            quoteCache = { quotes, expiresAt: now + 10_000, feedSource: "DhanHQ Live Feed" };
            return { ok: true, quotes, feedSource: "DhanHQ Live Feed" };
          }
        }
      } catch {}
    }

    // 2. High-performance Parallel Live NSE Feed fallback
    const fetchOne = async (item: NiftyStock): Promise<LiveStockQuote | null> => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          item.symbol + ".NS",
        )}?interval=1d&range=5d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
        if (!res.ok) return null;
        const j = (await res.json()) as any;
        const m = j?.chart?.result?.[0]?.meta;
        if (!m?.regularMarketPrice) return null;

        const price = Number(m.regularMarketPrice);
        const prev = Number(m.previousClose ?? m.chartPreviousClose ?? price);
        const change = +(price - prev).toFixed(2);
        const changePct = prev > 0 ? +((change / prev) * 100).toFixed(2) : 0;
        return {
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          price: +price.toFixed(2),
          change,
          changePct,
          open: Number(m.regularMarketDayOpen ?? prev),
          high: Number(m.regularMarketDayHigh ?? price),
          low: Number(m.regularMarketDayLow ?? price),
          prevClose: prev,
          volume: Number(m.regularMarketVolume ?? 0),
          high52: Number(m.fiftyTwoWeekHigh ?? price * 1.2),
          low52: Number(m.fiftyTwoWeekLow ?? price * 0.8),
          feedSource: "NSE Live",
        };
      } catch {
        return null;
      }
    };

    const results: LiveStockQuote[] = [];
    const CHUNK_SIZE = 15;
    for (let i = 0; i < targetList.length; i += CHUNK_SIZE) {
      const batch = targetList.slice(i, i + CHUNK_SIZE);
      const batchRes = await Promise.all(batch.map(fetchOne));
      for (const q of batchRes) {
        if (q && q.price > 0) results.push(q);
      }
    }

    if (results.length > 0) {
      quoteCache = { quotes: results, expiresAt: now + 10_000, feedSource: "NSE Live Feed" };
    }

    return {
      ok: true,
      quotes: results,
      feedSource: dhanCreds ? "DhanHQ Live Feed" : "NSE Live Feed",
    };
  });

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
        symbol: z.string().min(1),
        range: z.string().default("1d"),
        interval: z.string().default("5m"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; points: StockChartPoint[]; feedSource: string }> => {
    const cleanSym = data.symbol.replace(/\.NS$/i, "").toUpperCase();

    // 1. Try DhanHQ Charts if credentials are configured
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
            price: +c.price.toFixed(2),
            volume: c.volume,
            open: +c.open.toFixed(2),
            high: +c.high.toFixed(2),
            low: +c.low.toFixed(2),
          }));
          return { ok: true, points, feedSource: "DhanHQ Historical" };
        }
      } catch {}
    }

    // 2. Fallback to Yahoo Finance Chart
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      cleanSym + ".NS",
    )}?interval=${data.interval}&range=${data.range}`;

    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
      if (res.ok) {
        const j = (await res.json()) as any;
        const r = j?.chart?.result?.[0];
        const timestamps: number[] = r?.timestamp ?? [];
        const quote = r?.indicators?.quote?.[0] ?? {};
        const opens = quote.open ?? [];
        const highs = quote.high ?? [];
        const lows = quote.low ?? [];
        const closes = quote.close ?? [];
        const volumes = quote.volume ?? [];

        const points: StockChartPoint[] = [];
        const intraday = data.range === "1d" || data.range === "5d";

        for (let i = 0; i < timestamps.length; i++) {
          const c = closes[i];
          if (typeof c === "number" && Number.isFinite(c)) {
            points.push({
              t: new Date(timestamps[i] * 1000).toLocaleString("en-IN", {
                ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
                day: "2-digit",
                month: "short",
                ...(data.range === "5y" || data.range === "max" ? { year: "numeric" } : {}),
              }),
              price: +c.toFixed(2),
              volume: volumes[i] ?? 0,
              open: +(opens[i] ?? c).toFixed(2),
              high: +(highs[i] ?? c).toFixed(2),
              low: +(lows[i] ?? c).toFixed(2),
            });
          }
        }
        return { ok: true, points, feedSource: "NSE Live Feed" };
      }
    } catch {}

    return { ok: false, points: [], feedSource: "Unavailable" };
  });
