/**
 * Real-quote / real-bar access layer shared by the terminal, charts and screeners.
 *
 * Source order for Indian instruments: DhanHQ (authorized broker feed) -> Yahoo Finance (delayed).
 * Global instruments (CME index futures etc.) use Yahoo Finance. When no live source answers, the
 * last real response held in the module cache is returned and labelled STALE / MARKET_CLOSED.
 * Nothing in this file ever fabricates a price: callers get `null` when there is nothing real.
 *
 * The module cache is best-effort only (Workers isolates are recycled at any time) and no timers
 * or fetches run at import time.
 */
import { getDhanChartCandles, getDhanCredentials, getDhanQuote } from "./dhan.server.ts";
import {
  TtlCache,
  classifyFreshness,
  fetchJsonWithRetry,
  isAllowedYahooInterval,
  isAllowedYahooRange,
  isMarketOpenAt,
  isValidSymbol,
  type FreshnessStatus,
} from "./provider-utils.ts";
import { parseYahooChart, type YahooBar, type YahooChartData } from "./provider-parsers.ts";

export { aggregateBars } from "./provider-parsers.ts";

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"] as const;
const YAHOO_UA = "Mozilla/5.0 InvestIQ";
/** How long a last-known-real response may be re-served when every source is down. */
const MAX_STALE_MS = 24 * 3600_000;

const chartCache = new TtlCache<YahooChartData>(250);

function chartTtlMs(interval: string): number {
  if (interval === "1m" || interval === "2m") return 10_000;
  if (interval === "5m") return 20_000;
  if (interval === "1d" || interval === "5d" || interval === "1wk" || interval === "1mo")
    return 20_000;
  return 45_000;
}

export interface YahooFetchResult {
  chart: YahooChartData;
  /** True when this is a previously-cached real response served because live fetches failed. */
  stale: boolean;
  /** Age of the cached copy in ms (0 when freshly fetched). */
  ageMs: number;
}

/**
 * Cached, validated, retried Yahoo v8 chart fetch.
 * Returns null for invalid inputs or when nothing real is available.
 */
export async function fetchYahooChart(
  symbol: string,
  interval: string,
  range: string,
): Promise<YahooFetchResult | null> {
  if (!isValidSymbol(symbol) || !isAllowedYahooInterval(interval) || !isAllowedYahooRange(range)) {
    return null;
  }
  const key = `${symbol}|${interval}|${range}`;
  const fresh = chartCache.get(key, chartTtlMs(interval));
  if (fresh) return { chart: fresh, stale: false, ageMs: chartCache.getStale(key)?.ageMs ?? 0 };

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      const res = await fetchJsonWithRetry(
        url,
        { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } },
        { timeoutMs: 5000, retries: 1 },
      );
      if (!res.ok) continue;
      const chart = parseYahooChart(res.json);
      if (chart && (chart.points.length > 0 || chart.meta.regularMarketPrice)) {
        chartCache.set(key, chart);
        return { chart, stale: false, ageMs: 0 };
      }
    } catch {
      /* try the next host, then fall back to the stale copy */
    }
  }

  const stale = chartCache.getStale(key, MAX_STALE_MS);
  return stale ? { chart: stale.value, stale: true, ageMs: stale.ageMs } : null;
}

/* ------------------------------------------ Quotes ------------------------------------------ */

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
  source: "dhan" | "yahoo" | "yahoo-cache";
  /** ms epoch of the market data point */
  asOfMs: number;
  freshnessStatus: FreshnessStatus;
  marketOpen: boolean;
}

export interface QuoteRequest {
  yahooSymbol: string;
  /** Symbol understood by the Dhan scrip map (e.g. "NIFTY 50", "RELIANCE"). */
  dhanSymbol?: string;
  isGlobal?: boolean;
}

const round2 = (n: number) => +n.toFixed(2);

export async function getInstrumentQuote(req: QuoteRequest): Promise<InstrumentQuote | null> {
  const now = Date.now();
  const marketOpen = isMarketOpenAt(new Date(now), Boolean(req.isGlobal));

  if (req.dhanSymbol && getDhanCredentials()) {
    const q = await getDhanQuote(req.dhanSymbol);
    if (q && q.price > 0) {
      return {
        symbol: req.yahooSymbol,
        price: q.price,
        prevClose: q.prevClose,
        change: q.change,
        changePct: q.changePct,
        open: q.open,
        high: q.high,
        low: q.low,
        volume: q.volume,
        currency: "INR",
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
  }

  const r = await fetchYahooChart(req.yahooSymbol, "1d", "5d");
  if (!r) return null;
  const { meta, points, bars } = r.chart;
  const last = points[points.length - 1];
  const price = meta.regularMarketPrice ?? last?.close ?? 0;
  if (!(price > 0)) return null;

  const prevClose =
    points.length >= 2
      ? points[points.length - 2].close
      : (meta.previousClose ?? meta.chartPreviousClose ?? price);
  const change = round2(price - prevClose);
  const lastBar = bars[bars.length - 1];
  const asOfMs = (meta.regularMarketTime ?? last?.time ?? 0) * 1000;
  const freshness = r.stale
    ? marketOpen
      ? "STALE"
      : "MARKET_CLOSED"
    : classifyFreshness({ asOfMs, nowMs: now, marketOpen, feed: "delayed" });

  return {
    symbol: req.yahooSymbol,
    name: meta.longName ?? meta.shortName,
    price: round2(price),
    prevClose: round2(prevClose),
    change,
    changePct: prevClose > 0 ? round2((change / prevClose) * 100) : 0,
    open: round2(lastBar?.open ?? price),
    high: round2(meta.regularMarketDayHigh ?? lastBar?.high ?? price),
    low: round2(meta.regularMarketDayLow ?? lastBar?.low ?? price),
    volume: meta.regularMarketVolume ?? last?.volume ?? 0,
    high52: meta.fiftyTwoWeekHigh,
    low52: meta.fiftyTwoWeekLow,
    currency: meta.currency ?? (req.isGlobal ? "USD" : "INR"),
    source: r.stale ? "yahoo-cache" : "yahoo",
    asOfMs,
    freshnessStatus: freshness,
    marketOpen,
  };
}

/* ------------------------------------------- Bars ------------------------------------------- */

export interface BarsRequest {
  yahooSymbol: string;
  interval: string;
  range: string;
  isGlobal?: boolean;
  /** When set (Indian instruments), DhanHQ candles are tried first. */
  dhan?: { symbol: string; range: string; minutes?: number };
}

export interface BarsResult {
  bars: YahooBar[];
  currency: string;
  price: number;
  prevClose: number;
  source: "dhan" | "yahoo" | "yahoo-cache";
  asOfMs: number;
  freshnessStatus: FreshnessStatus;
  marketOpen: boolean;
}

export async function getInstrumentBars(req: BarsRequest): Promise<BarsResult | null> {
  const now = Date.now();
  const marketOpen = isMarketOpenAt(new Date(now), Boolean(req.isGlobal));

  if (req.dhan && getDhanCredentials()) {
    const candles = await getDhanChartCandles(req.dhan.symbol, req.dhan.range, req.dhan.minutes);
    if (candles && candles.length > 0) {
      const bars: YahooBar[] = candles.map((c) => ({
        time: Math.floor(c.t / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.price,
        volume: c.volume,
      }));
      const lastBar = bars[bars.length - 1];
      const daily = req.dhan.minutes === undefined || req.dhan.minutes >= 1440;
      // A daily candle is stamped with the session start, so judge freshness by fetch time.
      const asOfMs = daily ? now : lastBar.time * 1000;
      return {
        bars,
        currency: "INR",
        price: lastBar.close,
        prevClose: bars[0]?.close ?? lastBar.close,
        source: "dhan",
        asOfMs,
        freshnessStatus: classifyFreshness({ asOfMs, nowMs: now, marketOpen, feed: "realtime" }),
        marketOpen,
      };
    }
  }

  const r = await fetchYahooChart(req.yahooSymbol, req.interval, req.range);
  if (!r || r.chart.bars.length === 0) return null;
  const { meta, bars } = r.chart;
  const lastBar = bars[bars.length - 1];
  const asOfMs = (meta.regularMarketTime ?? lastBar.time) * 1000;
  const price = meta.regularMarketPrice ?? lastBar.close;
  return {
    bars,
    currency: meta.currency ?? (req.isGlobal ? "USD" : "INR"),
    price,
    prevClose: meta.previousClose ?? meta.chartPreviousClose ?? bars[0]?.close ?? price,
    source: r.stale ? "yahoo-cache" : "yahoo",
    asOfMs,
    freshnessStatus: r.stale
      ? marketOpen
        ? "STALE"
        : "MARKET_CLOSED"
      : classifyFreshness({ asOfMs, nowMs: now, marketOpen, feed: "delayed" }),
    marketOpen,
  };
}
