/**
 * Groww Trading API client — DEPRECATED.
 * All live data feeds, charts, and user portfolio holdings have been migrated to DhanHQ API v2.
 * This file provides backwards-compatible bridges to DhanHQ.
 */
import {
  getDhanChartCandles,
  getDhanQuote,
  getDhanEnrichedHoldings,
  getDhanRawHoldings,
  getDhanLtp,
  getDhanOptionChain,
} from "./dhan.server";

export type GrowwSegment = "CASH" | "FNO";

export type GrowwQuote = {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  change: number;
  changePct: number;
};

export type GrowwCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function getGrowwToken(): Promise<string> {
  return "dhan-migrated";
}

export async function growwLtp(exchangeSymbols: string[], _segment: GrowwSegment = "CASH") {
  const syms = exchangeSymbols.map((s) => s.replace(/^[A-Z]+_/, ""));
  const ltp = await getDhanLtp(syms);
  return ltp || {};
}

export async function growwQuote(
  tradingSymbol: string,
  _exchange = "NSE",
  _segment: GrowwSegment = "CASH",
): Promise<GrowwQuote> {
  const q = await getDhanQuote(tradingSymbol);
  if (q) return q;
  return {
    symbol: tradingSymbol,
    price: 0,
    open: 0,
    high: 0,
    low: 0,
    prevClose: 0,
    volume: 0,
    change: 0,
    changePct: 0,
  };
}

export async function growwCandles(opts: {
  tradingSymbol: string;
  exchange?: string;
  segment?: GrowwSegment;
  start: number;
  end: number;
  intervalMinutes?: number;
}): Promise<GrowwCandle[]> {
  const range = opts.end - opts.start > 5 * 86400_000 ? "1mo" : "5d";
  const c = await getDhanChartCandles(opts.tradingSymbol, range, opts.intervalMinutes);
  if (!c) return [];
  return c.map((row) => ({
    time: Math.floor(row.t / 1000),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.price,
    volume: row.volume,
  }));
}

export async function growwHoldings() {
  const h = await getDhanRawHoldings();
  return h || [];
}

export async function growwEnrichedHoldings() {
  const data = await getDhanEnrichedHoldings();
  return {
    holdings: data.holdings,
    summary: data.summary,
  };
}

export async function growwOptionChain(underlying: string, expiryDate: string, _exchange = "NSE") {
  return await getDhanOptionChain(underlying, expiryDate);
}

export async function growwStatus() {
  const configured = Boolean(process.env.GROWW_API_KEY && process.env.GROWW_API_SECRET);
  return {
    configured,
    status: configured ? "connected" : "unconfigured",
    message: configured ? "Connected" : "API key not configured",
  };
}
