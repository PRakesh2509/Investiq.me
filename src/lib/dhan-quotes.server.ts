/**
 * DhanHQ Authorized Live Quote & Historical Provider (Server-only).
 *
 * 100% Dhan-backed: No Yahoo Finance imports, endpoints, fallbacks or dependencies.
 */

import { getDhanOhlc, getDhanLtp, getDhanChartCandles } from "./dhan.server.ts";

export interface DhanQuoteResult {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  change: number;
  changePct: number;
  high52?: number;
  low52?: number;
  currency: string;
  timestampIst: string;
}

/**
 * Normalises a symbol to clean Dhan lookup ticker (stripping .NS, .BO, caret).
 */
export function toCleanSymbol(symbol: string): string {
  if (!symbol) return "";
  return symbol
    .trim()
    .replace(/\.NS$/i, "")
    .replace(/\.BO$/i, "")
    .replace(/^\^/, "")
    .toUpperCase();
}

/**
 * Fetches single live quote from DhanHQ.
 */
export async function fetchDhanQuote(symbol: string): Promise<DhanQuoteResult | null> {
  const clean = toCleanSymbol(symbol);
  if (!clean) return null;

  try {
    const ohlcMap = await getDhanOhlc([clean]);
    const d = ohlcMap?.[clean];
    if (!d || d.price <= 0) {
      // Fallback to LTP
      const ltpMap = await getDhanLtp([clean]);
      const ltp = ltpMap?.[clean];
      if (ltp && ltp > 0) {
        const ist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        return {
          symbol: clean,
          price: ltp,
          open: ltp,
          high: ltp,
          low: ltp,
          prevClose: ltp,
          volume: 0,
          change: 0,
          changePct: 0,
          currency: "INR",
          timestampIst: ist,
        };
      }
      return null;
    }

    const prevClose = d.close > 0 ? d.close : d.open;
    const change = +(d.price - prevClose).toFixed(2);
    const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
    const ist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

    return {
      symbol: clean,
      price: d.price,
      open: d.open,
      high: d.high,
      low: d.low,
      prevClose,
      volume: d.volume,
      change,
      changePct,
      currency: "INR",
      timestampIst: ist,
    };
  } catch {
    return null;
  }
}

/**
 * Batch-fetches live quotes for multiple symbols from DhanHQ.
 */
export async function fetchDhanQuotes(symbols: string[]): Promise<(DhanQuoteResult | null)[]> {
  const cleanSyms = symbols.map(toCleanSymbol).filter(Boolean);
  if (cleanSyms.length === 0) return [];

  try {
    const ohlcMap = await getDhanOhlc(cleanSyms);
    const ist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });

    return symbols.map((raw) => {
      const clean = toCleanSymbol(raw);
      const d = ohlcMap?.[clean];
      if (!d || d.price <= 0) return null;

      const prevClose = d.close > 0 ? d.close : d.open;
      const change = +(d.price - prevClose).toFixed(2);
      const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;

      return {
        symbol: clean,
        price: d.price,
        open: d.open,
        high: d.high,
        low: d.low,
        prevClose,
        volume: d.volume,
        change,
        changePct,
        currency: "INR",
        timestampIst: ist,
      };
    });
  } catch {
    return symbols.map(() => null);
  }
}

/**
 * Fetches daily closing prices from Dhan candles.
 */
export async function fetchDhanDailyCloses(
  symbol: string,
  days = 30,
): Promise<{ time: number; close: number }[]> {
  const clean = toCleanSymbol(symbol);
  if (!clean) return [];

  try {
    const range = days > 30 ? "6mo" : "1mo";
    const candles = await getDhanChartCandles(clean, range);
    if (!candles || candles.length === 0) return [];

    return candles.slice(-days).map((c) => ({
      time: Math.floor(c.t / 1000),
      close: c.price,
    }));
  } catch {
    return [];
  }
}

