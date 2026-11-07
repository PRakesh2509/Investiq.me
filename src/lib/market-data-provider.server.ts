/**
 * Real-quote / real-bar access layer shared by the terminal, charts and screeners.
 *
 * 100% DhanHQ Authorized Broker Feed (Dhan-only). No external or unverified fallbacks.
 * When market is closed, returns real session data with MARKET_CLOSED classification.
 */
import { getDhanChartCandles } from "./dhan.server.ts";
import { fetchDhanQuote } from "./dhan-quotes.server.ts";
import {
  classifyFreshness,
  isMarketOpenAt,
  type FreshnessStatus,
} from "./provider-utils.ts";
import { aggregateBars, type OhlcBar } from "./provider-parsers.ts";

export { aggregateBars, type OhlcBar };

export interface InstrumentQuote {
  symbol: string;
  name?: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  high52?: number;
  low52?: number;
  currency: string;
  source: "dhan";
  asOfMs: number;
  freshnessStatus: FreshnessStatus;
  marketOpen: boolean;
}

export interface QuoteRequest {
  symbol?: string;
  dhanSymbol?: string;
  isGlobal?: boolean;
}

export async function getInstrumentQuote(req: QuoteRequest): Promise<InstrumentQuote | null> {
  const sym = req.dhanSymbol || req.symbol || "";
  const now = Date.now();
  const marketOpen = isMarketOpenAt(new Date(now), Boolean(req.isGlobal));

  const q = await fetchDhanQuote(sym);
  if (!q || q.price <= 0) return null;

  return {
    symbol: q.symbol,
    name: q.symbol,
    price: q.price,
    prevClose: q.prevClose,
    change: q.change,
    changePct: q.changePct,
    open: q.open,
    high: q.high,
    low: q.low,
    volume: q.volume,
    high52: q.high52,
    low52: q.low52,
    currency: q.currency || "INR",
    source: "dhan",
    asOfMs: now,
    freshnessStatus: classifyFreshness({
      asOfMs: now,
      nowMs: now,
      marketOpen,
      feed: "realtime",
    }),
    marketOpen,
  };
}

export interface BarsRequest {
  symbol?: string;
  interval?: string;
  range?: string;
  isGlobal?: boolean;
  dhan?: { symbol: string; range: string; minutes?: number };
}

export interface BarsResult {
  bars: OhlcBar[];
  currency: string;
  price: number;
  prevClose: number;
  source: "dhan";
  asOfMs: number;
  freshnessStatus: FreshnessStatus;
  marketOpen: boolean;
}

export async function getInstrumentBars(req: BarsRequest): Promise<BarsResult | null> {
  const sym = req.dhan?.symbol || req.symbol || "";
  const range = req.dhan?.range || req.range || "5d";
  const minutes = req.dhan?.minutes || 5;
  const now = Date.now();
  const marketOpen = isMarketOpenAt(new Date(now), Boolean(req.isGlobal));

  const candles = await getDhanChartCandles(sym, range, minutes);
  if (!candles || candles.length === 0) return null;

  const bars: OhlcBar[] = candles.map((c) => ({
    time: Math.floor(c.t / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.price,
    volume: c.volume,
  }));

  const lastBar = bars[bars.length - 1];
  const asOfMs = lastBar ? lastBar.time * 1000 : now;

  return {
    bars,
    currency: "INR",
    price: lastBar?.close ?? 0,
    prevClose: bars[0]?.close ?? lastBar?.close ?? 0,
    source: "dhan",
    asOfMs,
    freshnessStatus: classifyFreshness({ asOfMs, nowMs: now, marketOpen, feed: "realtime" }),
    marketOpen,
  };
}
