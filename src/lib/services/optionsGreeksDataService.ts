/**
 * Options Greeks Data Service (`optionsGreeksDataService`)
 *
 * Implements Phase 1 & 2: Strike-wise Options Greeks ingestion & synchronization.
 * Integrates with Sensibull live feed (when partner credentials configured) or
 * Calibrated Greeks Engine (Black-Scholes with Indian volatility skew).
 * Tracks Greeks velocity (consecutive snapshot differentials).
 *
 * Integrity rules:
 * - Anything not served by the direct Sensibull API is a locally computed (simulated)
 *   Black-Scholes surface and is flagged `isSimulated`.
 * - Velocity is only reported against a recent previous snapshot; module memory on
 *   Workers is ephemeral so a stale baseline is discarded rather than compared.
 */

import { fetchSensibullGreeksChartData, type SensibullGreekPoint } from "../sensibull.server.ts";
import type { ProviderStatusInfo } from "../options-data-provider.server.ts";
import { TtlSingleFlightCache } from "./ttlSingleFlightCache.ts";
import { DataUnavailableError } from "./dataUnavailableError.ts";

export interface GreeksVelocityPoint {
  strike: number;
  deltaChange: number;
  gammaChange: number;
  thetaChange: number;
  vegaChange: number;
  ivChange: number;
}

export interface SynchronizedGreeksSnapshot {
  instrument: string;
  underlyingPrice: number;
  expiryDate: string;
  atmStrike: number;
  daysToExpiry: number;
  provider:
    | "Sensibull Direct API"
    | "Sensibull Greeks Engine (Calibrated Live Feed)"
    | "CBOE / CME Global Feed";
  authorizationStatus: ProviderStatusInfo;
  isDirectSensibullAuthorized: boolean;
  /** True when the Greeks surface is computed locally instead of coming from a live feed. */
  isSimulated: boolean;
  dataSource: "LIVE_SENSIBULL" | "BROKER_CHAIN" | "SIMULATED_BLACK_SCHOLES";
  /** Provider freshness verdict (e.g. LIVE, DELAYED, STALE, MARKET_CLOSED) when reported. */
  freshnessStatus?: string;
  points: SensibullGreekPoint[];
  velocity: GreeksVelocityPoint[];
  /** False when no recent previous snapshot existed, so velocity values are zero placeholders. */
  velocityAvailable: boolean;
  summary: {
    atmCallDelta: number;
    atmPutDelta: number;
    peakGamma: number;
    peakGammaStrike: number;
    maxThetaBurn: number;
    maxThetaStrike: number;
    atmIv: number;
  };
  timestamp: string;
}

type RawGreeks = Awaited<ReturnType<typeof fetchSensibullGreeksChartData>>;

/** Velocity is only meaningful against a baseline captured within this window. */
const VELOCITY_BASELINE_MAX_AGE_MS = 60_000;

export class OptionsGreeksDataService {
  // Bounded best-effort memory of the previous snapshot per instrument.
  private readonly lastSnapshots = new TtlSingleFlightCache<RawGreeks>({
    ttlMs: VELOCITY_BASELINE_MAX_AGE_MS,
    maxEntries: 32,
  });

  /**
   * Retrieve and synchronize Greeks chart data for an underlying instrument
   */
  public async getGreeksSnapshot(
    instrument: string = "NIFTY 50",
    customExpiry?: string,
  ): Promise<SynchronizedGreeksSnapshot> {
    const isGlobal =
      ["S&P 500", "NASDAQ 100", "DOW JONES", "SP500", "NASDAQ100", "DOWJONES"].includes(
        instrument.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ) ||
      instrument.includes("$") ||
      instrument.includes("S&P") ||
      instrument.includes("NASDAQ") ||
      instrument.includes("DOW");

    const rawGreeks = await fetchSensibullGreeksChartData(instrument, customExpiry);
    if (rawGreeks.unavailable || rawGreeks.points.length === 0) {
      throw new DataUnavailableError(
        `Greeks unavailable for ${instrument}`,
        rawGreeks.dataQualityNotes ?? [],
      );
    }
    const isDirect = rawGreeks.provider === "Sensibull Direct API";
    // The provider layer flags model-generated curves; older shapes fall back to the status.
    const simulated = rawGreeks.isSimulated ?? rawGreeks.dataSourceStatus === "CALIBRATED_ENGINE";
    let authStatus: ProviderStatusInfo;
    if (rawGreeks.sensibullStatus) {
      authStatus = rawGreeks.sensibullStatus;
    } else if (isGlobal) {
      authStatus = {
        providerName: "CBOE / CME" as const,
        isAuthorized: !simulated,
        status: simulated ? ("CONFIG_MISSING" as const) : ("GLOBAL_FEED" as const),
        reason: simulated
          ? "No live CBOE / CME Greeks feed available; Greeks are model-generated."
          : "Greeks derived from the delayed CBOE / CME option chain.",
        documentationUrl: "https://www.cboe.com",
        canStreamLiveData: false,
      };
    } else {
      authStatus = (
        await import("../options-data-provider.server.ts")
      ).getSensibullAuthorizationStatus();
    }

    // Compute velocity only against a recent previous snapshot of the same expiry.
    const key = `${instrument}_${customExpiry ?? "DEFAULT"}`;
    const prevEntry = this.lastSnapshots.peek(key);
    const prev =
      prevEntry &&
      prevEntry.ageMs <= VELOCITY_BASELINE_MAX_AGE_MS &&
      prevEntry.value.expiryDate === rawGreeks.expiryDate
        ? prevEntry.value
        : undefined;

    const velocity: GreeksVelocityPoint[] = rawGreeks.points.map((curr) => {
      const p = prev?.points.find((x) => x.strike === curr.strike);
      if (!p) {
        return {
          strike: curr.strike,
          deltaChange: 0,
          gammaChange: 0,
          thetaChange: 0,
          vegaChange: 0,
          ivChange: 0,
        };
      }
      return {
        strike: curr.strike,
        deltaChange: +(curr.callDelta - p.callDelta).toFixed(4),
        gammaChange: +(curr.callGamma - p.callGamma).toFixed(4),
        thetaChange: +(curr.callTheta - p.callTheta).toFixed(2),
        vegaChange: +(curr.callVega - p.callVega).toFixed(2),
        ivChange: +(curr.callIv - p.callIv).toFixed(2),
      };
    });

    // Save for next comparison
    this.lastSnapshots.set(key, rawGreeks);

    return {
      instrument,
      underlyingPrice: rawGreeks.underlyingPrice,
      expiryDate: rawGreeks.expiryDate,
      atmStrike: rawGreeks.atmStrike,
      daysToExpiry: rawGreeks.daysToExpiry,
      provider: rawGreeks.provider,
      authorizationStatus: authStatus,
      isDirectSensibullAuthorized: !isGlobal && isDirect && authStatus.isAuthorized,
      isSimulated: simulated,
      dataSource: simulated
        ? "SIMULATED_BLACK_SCHOLES"
        : isDirect
          ? "LIVE_SENSIBULL"
          : "BROKER_CHAIN",
      freshnessStatus: rawGreeks.freshnessStatus,
      points: rawGreeks.points,
      velocity,
      velocityAvailable: prev !== undefined,
      summary: rawGreeks.summary,
      timestamp: rawGreeks.timestamp,
    };
  }
}

export const optionsGreeksDataService = new OptionsGreeksDataService();
