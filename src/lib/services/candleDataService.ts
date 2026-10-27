/**
 * Candle Data Service (`candleDataService`)
 *
 * Fetches REAL intraday OHLCV candles for the underlying (Yahoo Finance chart API) and
 * never fabricates bars. When the upstream is unreachable or returns too few candles the
 * result is explicitly `source: "UNAVAILABLE"` with an empty bar list so that downstream
 * technical indicators are reported as unavailable instead of being invented.
 *
 * Workers-safe: no module-load side effects; the cache is bounded, per-key single-flight.
 */

import { WORKSTATION_INSTRUMENTS, type WorkstationBar } from "../terminal-workstation.functions.ts";
import { TtlSingleFlightCache } from "./ttlSingleFlightCache.ts";

export interface CandleResult {
  instrument: string;
  bars: WorkstationBar[];
  source: "YAHOO_5M" | "UNAVAILABLE";
  /** Epoch ms of the last candle's open time (null when unavailable). */
  lastBarAtMs: number | null;
  fetchedAtMs: number;
  error?: string;
}

export type CandleFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface CandleDataServiceOptions {
  fetchImpl?: CandleFetcher;
  ttlMs?: number;
  /** Failures are cached briefly so a flaky upstream is not hammered. */
  failureTtlMs?: number;
  maxEntries?: number;
  timeoutMs?: number;
  now?: () => number;
}

const MIN_BARS = 30; // enough for RSI(14) + EMA(21) warm-up

export class CandleDataService {
  private readonly cache: TtlSingleFlightCache<CandleResult>;
  private readonly fetchImpl: CandleFetcher;
  private readonly failureTtlMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(opts: CandleDataServiceOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.failureTtlMs = opts.failureTtlMs ?? 10_000;
    this.timeoutMs = opts.timeoutMs ?? 4_000;
    this.cache = new TtlSingleFlightCache<CandleResult>({
      ttlMs: opts.ttlMs ?? 30_000,
      maxEntries: opts.maxEntries ?? 16,
      now: this.now,
    });
  }

  public async getIntradayCandles(instrument: string): Promise<CandleResult> {
    const cfg = WORKSTATION_INSTRUMENTS[instrument];
    if (!cfg) {
      return this.unavailable(instrument, "Unknown instrument");
    }
    const cached = this.cache.peek(instrument);
    const ttl = cached && cached.value.source === "UNAVAILABLE" ? this.failureTtlMs : undefined;
    return this.cache.getOrCompute(
      instrument,
      () => this.fetchCandles(instrument, cfg.yahooSymbol),
      {
        ttlMs: ttl,
      },
    );
  }

  public clear(): void {
    this.cache.clear();
  }

  private unavailable(instrument: string, error: string): CandleResult {
    return {
      instrument,
      bars: [],
      source: "UNAVAILABLE",
      lastBarAtMs: null,
      fetchedAtMs: this.now(),
      error,
    };
  }

  private async fetchCandles(instrument: string, yahooSymbol: string): Promise<CandleResult> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol,
      )}?interval=5m&range=5d`;
      const res = await this.fetchImpl(url, {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return this.unavailable(instrument, `Candle upstream HTTP ${res.status}`);

      const json = (await res.json()) as YahooChartResponse;
      const result = json?.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0];
      const bars: WorkstationBar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = quote?.open?.[i];
        const h = quote?.high?.[i];
        const l = quote?.low?.[i];
        const c = quote?.close?.[i];
        const v = quote?.volume?.[i];
        if (
          typeof o === "number" &&
          typeof h === "number" &&
          typeof l === "number" &&
          typeof c === "number" &&
          Number.isFinite(o + h + l + c)
        ) {
          bars.push({
            time: timestamps[i],
            open: o,
            high: h,
            low: l,
            close: c,
            volume: typeof v === "number" && Number.isFinite(v) ? v : 0,
          });
        }
      }
      if (bars.length < MIN_BARS) {
        return this.unavailable(
          instrument,
          `Only ${bars.length} real candles available (need ${MIN_BARS})`,
        );
      }
      const trimmed = bars.slice(-300);
      return {
        instrument,
        bars: trimmed,
        source: "YAHOO_5M",
        lastBarAtMs: trimmed[trimmed.length - 1].time * 1000,
        fetchedAtMs: this.now(),
      };
    } catch (e) {
      return this.unavailable(instrument, e instanceof Error ? e.message : "Candle fetch failed");
    }
  }
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

export const candleDataService = new CandleDataService();
