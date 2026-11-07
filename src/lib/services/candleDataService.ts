/**
 * Candle Data Service (`candleDataService`)
 *
 * Fetches REAL intraday OHLCV candles for the underlying via DhanHQ API v2 and
 * never fabricates bars. When the upstream is unreachable or returns too few candles the
 * result is explicitly `source: "UNAVAILABLE"` with an empty bar list so that downstream
 * technical indicators are reported as unavailable instead of being invented.
 *
 * Workers-safe: no module-load side effects; the cache is bounded, per-key single-flight.
 */

import { WORKSTATION_INSTRUMENTS, type WorkstationBar } from "../terminal-workstation.functions.ts";
import { getDhanChartCandles } from "../dhan.server.ts";
import { TtlSingleFlightCache } from "./ttlSingleFlightCache.ts";

export interface CandleResult {
  instrument: string;
  bars: WorkstationBar[];
  source: "DHAN_5M" | "UNAVAILABLE";
  /** Epoch ms of the last candle's open time (null when unavailable). */
  lastBarAtMs: number | null;
  fetchedAtMs: number;
  error?: string;
}

export interface CandleDataServiceOptions {
  ttlMs?: number;
  failureTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

const MIN_BARS = 30; // enough for RSI(14) + EMA(21) warm-up

export class CandleDataService {
  private readonly cache: TtlSingleFlightCache<CandleResult>;
  private readonly failureTtlMs: number;
  private readonly now: () => number;

  constructor(opts: CandleDataServiceOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.failureTtlMs = opts.failureTtlMs ?? 10_000;
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
      () => this.fetchCandles(instrument),
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

  private async fetchCandles(instrument: string): Promise<CandleResult> {
    try {
      const candles = await getDhanChartCandles(instrument, "5d", 5);
      if (!candles || candles.length < MIN_BARS) {
        return this.unavailable(
          instrument,
          `Only ${candles?.length ?? 0} real candles available from Dhan (need ${MIN_BARS})`,
        );
      }
      const trimmedCandles = candles.slice(-300);
      const bars: WorkstationBar[] = trimmedCandles.map((c) => ({
        time: Math.floor(c.t / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.price,
        volume: c.volume,
      }));

      return {
        instrument,
        bars,
        source: "DHAN_5M",
        lastBarAtMs: bars[bars.length - 1].time * 1000,
        fetchedAtMs: this.now(),
      };
    } catch (e) {
      return this.unavailable(instrument, e instanceof Error ? e.message : "Candle fetch failed");
    }
  }
}

export const candleDataService = new CandleDataService();
