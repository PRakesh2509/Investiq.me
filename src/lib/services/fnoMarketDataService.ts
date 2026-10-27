/**
 * F&O Market Data Service (`fnoMarketDataService`)
 *
 * Implements Phase 1 & 2: Continuous ingestion of authorized Indian F&O market data.
 * Interfaces with authorized brokers (DhanHQ API v2 / Upstox API v2 / Baseline).
 *
 * Integrity rules:
 * - Candles are REAL (Yahoo Finance) or absent; they are never synthesised.
 * - Futures price / volume have no feed here and are reported as null (not estimated).
 * - A baseline/simulated option chain is flagged (`isSimulated`) so downstream gates can
 *   refuse to treat it as tradeable market data.
 * - An unknown instrument or a failing provider raises an error; it never silently serves
 *   data for a different instrument.
 *
 * Workers-safe: bounded per-key TTL cache with single-flight, no timers.
 */

import type {
  NormalizedOptionChain,
  NormalizedOptionRow,
  ProviderStatusInfo,
} from "../options-data-provider.server.ts";
import { WORKSTATION_INSTRUMENTS, type WorkstationBar } from "../terminal-workstation.functions.ts";
import {
  marketDataValidationService,
  type MarketDataValidationReport,
} from "./marketDataValidationService.ts";
import { candleDataService, type CandleResult } from "./candleDataService.ts";
import { TtlSingleFlightCache } from "./ttlSingleFlightCache.ts";
import { DataUnavailableError } from "./dataUnavailableError.ts";

export interface FnoMarketSnapshot {
  instrument: string;
  underlyingPrice: number;
  /** No futures feed is wired in; null means unavailable (never estimated). */
  futuresPrice: number | null;
  futuresVolume: number | null;
  expiryDate: string;
  availableExpiries: string[];
  atmStrike: number;
  daysToExpiry: number;
  pcr: number;
  pcrDefinition: string;
  maxPainStrike: number;
  totalCallOi: number;
  totalPutOi: number;
  totalCallVolume: number;
  totalPutVolume: number;
  rows: NormalizedOptionRow[];
  /** Real intraday candles; empty when the candle feed is unavailable. */
  bars: WorkstationBar[];
  barsSource: CandleResult["source"];
  barsLastAt: string | null;
  barsError?: string;
  provider: string;
  providerStatus: ProviderStatusInfo;
  /** True when the option chain is a locally generated baseline rather than a broker feed. */
  isSimulated: boolean;
  dataSource: "LIVE_BROKER" | "DELAYED_FEED" | "SIMULATED_BASELINE";
  /** Machine-readable source reported by the provider layer (e.g. "dhan", "upstox", "cboe-delayed"). */
  providerDataSource?: string;
  chainTimestamp: string;
  validation: MarketDataValidationReport;
  timestamp: string;
  cacheTtlMs: number;
}

/**
 * Decide whether a chain is synthetic. Honours an explicit `isSimulated` flag from the
 * provider layer when present and otherwise infers it from the provider label.
 */
export function isSimulatedChain(chain: NormalizedOptionChain): boolean {
  const flagged = (chain as { isSimulated?: boolean }).isSimulated;
  if (typeof flagged === "boolean") return flagged;
  return chain.provider !== "DhanHQ v2" && chain.provider !== "Upstox v2";
}

/**
 * Fold the provider layer's own freshness verdict into the validation report, so a cached
 * (stale) or delayed chain can never look live just because its retrieval timestamp is recent.
 */
function reconcileValidation(
  v: MarketDataValidationReport,
  chain: NormalizedOptionChain,
): MarketDataValidationReport {
  if (chain.freshnessStatus === "STALE" && v.freshnessStatus !== "STALE") {
    return {
      ...v,
      isValid: false,
      freshnessStatus: "STALE",
      criticalCount: v.criticalCount + 1,
      issues: [
        ...v.issues,
        {
          field: "staleness",
          severity: "CRITICAL",
          message: "Provider reports the option chain as stale (cached fallback data).",
        },
      ],
    };
  }
  if (chain.freshnessStatus === "DELAYED" && v.freshnessStatus === "LIVE") {
    return {
      ...v,
      freshnessStatus: "DELAYED",
      warningsCount: v.warningsCount + 1,
      issues: [
        ...v.issues,
        {
          field: "staleness",
          severity: "WARNING",
          message: "Provider reports the option chain as delayed (not real-time).",
        },
      ],
    };
  }
  return v;
}

function describeProvider(chain: NormalizedOptionChain, isGlobal: boolean): ProviderStatusInfo {
  const simulated = isSimulatedChain(chain);
  if (!simulated && chain.provider === "CBOE / CME Global") {
    return {
      providerName: "CBOE / CME",
      isAuthorized: true,
      status: "GLOBAL_FEED",
      reason: "CBOE / CME delayed global option chain (not a real-time feed).",
      documentationUrl: "https://www.cboe.com",
      canStreamLiveData: false,
    };
  }
  if (!simulated) {
    const isUpstox = chain.provider === "Upstox v2";
    return {
      providerName: isUpstox ? "Upstox" : "DhanHQ",
      isAuthorized: true,
      status: "ACTIVE",
      reason: `${chain.provider} broker option chain active.`,
      documentationUrl: isUpstox
        ? "https://upstox.com/developer/api-documentation/"
        : "https://dhanhq.co/docs/v2/",
      canStreamLiveData: true,
    };
  }
  return {
    providerName: isGlobal ? "CBOE / CME" : "DhanHQ",
    isAuthorized: false,
    status: "CONFIG_MISSING",
    reason:
      "No live provider feed for this instrument. Any option prices, OI and bid/ask are a model-generated baseline and are not tradeable market data.",
    documentationUrl: isGlobal ? "https://www.cboe.com" : "https://dhanhq.co/docs/v2/",
    canStreamLiveData: false,
  };
}

export class FnoMarketDataService {
  private readonly CACHE_TTL_MS = 3000; // adheres to broker rate-limits
  private readonly cache = new TtlSingleFlightCache<FnoMarketSnapshot>({
    ttlMs: this.CACHE_TTL_MS,
    maxEntries: 32,
  });

  /**
   * Fetch complete synchronized F&O snapshot for an instrument
   */
  public async getMarketSnapshot(
    instrument: string = "NIFTY 50",
    customExpiry?: string,
    forceRefresh: boolean = false,
  ): Promise<FnoMarketSnapshot> {
    if (!Object.prototype.hasOwnProperty.call(WORKSTATION_INSTRUMENTS, instrument)) {
      throw new Error(`Unknown instrument: ${instrument}`);
    }
    const cacheKey = `${instrument}_${customExpiry || "DEFAULT"}`;
    return this.cache.getOrCompute(cacheKey, () => this.buildSnapshot(instrument, customExpiry), {
      forceRefresh,
    });
  }

  private async buildSnapshot(
    instrument: string,
    customExpiry?: string,
  ): Promise<FnoMarketSnapshot> {
    const cfg = WORKSTATION_INSTRUMENTS[instrument];

    // 1. Option chain + real candles in parallel. A failing chain is an error (no substitution).
    // The provider module is loaded lazily so importing this service has no module-load cost
    // or side effects (and the pure analysis code stays importable in isolation).
    const { optionsDataProvider } = await import("../options-data-provider.server.ts");
    const [chain, candles] = await Promise.all([
      optionsDataProvider.getOptionChain(instrument, customExpiry),
      candleDataService.getIntradayCandles(instrument),
    ]);

    if (chain.unavailable || chain.rows.length === 0) {
      throw new DataUnavailableError(
        `Option chain unavailable for ${instrument}`,
        chain.dataQualityNotes,
      );
    }
    const spotPrice = chain.underlyingPrice;
    if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
      throw new DataUnavailableError(
        `Provider returned an invalid underlying price for ${instrument}`,
      );
    }

    const simulated = isSimulatedChain(chain);

    // 2. Validation (uses the ATM call's real bid/ask when present)
    const atmRow = chain.rows.find((r) => r.isAtm) ?? chain.rows[Math.floor(chain.rows.length / 2)];
    const baseValidation = marketDataValidationService.validateQuote({
      instrument,
      spotPrice,
      timestamp: chain.timestamp,
      bid: atmRow?.call?.bid ?? null,
      ask: atmRow?.call?.ask ?? null,
      volume: chain.totalCallVolume,
      openInterest: chain.totalCallOi,
      ltp: atmRow?.call?.ltp,
    });
    const validation = reconcileValidation(baseValidation, chain);

    return {
      instrument,
      underlyingPrice: spotPrice,
      futuresPrice: null,
      futuresVolume: null,
      expiryDate: chain.expiryDate,
      availableExpiries: chain.availableExpiries,
      atmStrike: chain.atmStrike,
      daysToExpiry: chain.daysToExpiry,
      pcr: chain.pcr,
      pcrDefinition:
        "Total Put Open Interest divided by Total Call Open Interest (Total Put OI / Total Call OI)",
      maxPainStrike: chain.maxPainStrike,
      totalCallOi: chain.totalCallOi,
      totalPutOi: chain.totalPutOi,
      totalCallVolume: chain.totalCallVolume,
      totalPutVolume: chain.totalPutVolume,
      rows: chain.rows,
      bars: candles.bars,
      barsSource: candles.source,
      barsLastAt: candles.lastBarAtMs ? new Date(candles.lastBarAtMs).toISOString() : null,
      barsError: candles.error,
      provider: chain.provider,
      providerStatus: describeProvider(chain, Boolean(cfg.isGlobal)),
      isSimulated: simulated,
      dataSource: simulated
        ? "SIMULATED_BASELINE"
        : chain.freshnessStatus === "DELAYED"
          ? "DELAYED_FEED"
          : "LIVE_BROKER",
      providerDataSource: chain.dataSource,
      chainTimestamp: chain.timestamp,
      validation,
      timestamp: new Date().toISOString(),
      cacheTtlMs: this.CACHE_TTL_MS,
    };
  }
}

export const fnoMarketDataService = new FnoMarketDataService();
