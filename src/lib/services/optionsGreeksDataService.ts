/**
 * Options Greeks Data Service (`optionsGreeksDataService`)
 *
 * Implements Phase 1 & 2: Strike-wise Options Greeks ingestion & synchronization.
 * Integrates with Sensibull live feed (when partner credentials configured) or
 * Calibrated Greeks Engine (Black-Scholes with Indian volatility skew).
 * Tracks Greeks velocity (consecutive snapshot differentials).
 */

import {
  fetchSensibullGreeksChartData,
  type SensibullGreeksChartData,
  type SensibullGreekPoint,
} from "../sensibull.server.ts";
import {
  getSensibullAuthorizationStatus,
  type ProviderStatusInfo,
} from "../options-data-provider.server.ts";

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
  provider: "Sensibull Direct API" | "Sensibull Greeks Engine (Calibrated Live Feed)";
  authorizationStatus: ProviderStatusInfo;
  isDirectSensibullAuthorized: boolean;
  points: SensibullGreekPoint[];
  velocity: GreeksVelocityPoint[];
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

export class OptionsGreeksDataService {
  private lastSnapshots: Map<string, SensibullGreeksChartData> = new Map();

  /**
   * Retrieve and synchronize Greeks chart data for an underlying instrument
   */
  public async getGreeksSnapshot(
    instrument: string = "NIFTY 50",
    customExpiry?: string
  ): Promise<SynchronizedGreeksSnapshot> {
    const rawGreeks = await fetchSensibullGreeksChartData(instrument, customExpiry);
    const authStatus = getSensibullAuthorizationStatus();

    // Compute velocity if previous snapshot exists
    const prev = this.lastSnapshots.get(instrument);
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
    this.lastSnapshots.set(instrument, rawGreeks);

    return {
      instrument,
      underlyingPrice: rawGreeks.underlyingPrice,
      expiryDate: rawGreeks.expiryDate,
      atmStrike: rawGreeks.atmStrike,
      daysToExpiry: rawGreeks.daysToExpiry,
      provider: rawGreeks.provider,
      authorizationStatus: authStatus,
      isDirectSensibullAuthorized: authStatus.isAuthorized,
      points: rawGreeks.points,
      velocity,
      summary: rawGreeks.summary,
      timestamp: rawGreeks.timestamp,
    };
  }
}

export const optionsGreeksDataService = new OptionsGreeksDataService();
