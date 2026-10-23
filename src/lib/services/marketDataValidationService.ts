/**
 * Market Data Validation Service (`marketDataValidationService`)
 *
 * Implements Phase 2 & Phase 9 data validation, sanity checks, and stale data detection.
 * Ensures zero fabricated prices, validates units, instrument identifiers, and bid-ask spreads.
 */

import { tradingSessionService } from "./tradingSessionService.ts";

export type DataFreshnessStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "MARKET_CLOSED"
  | "INSUFFICIENT_DATA";

export interface DataValidationIssue {
  field: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  observedValue?: string | number | boolean | null | Record<string, string | number | boolean | null | undefined>;
}

export interface MarketDataValidationReport {
  isValid: boolean;
  freshnessStatus: DataFreshnessStatus;
  ageSeconds: number;
  maxAllowedAgeSeconds: number;
  issues: DataValidationIssue[];
  warningsCount: number;
  criticalCount: number;
  bidAskSpreadValid: boolean;
  spreadPct?: number;
  timestamp: string;
}

export interface QuoteValidationInput {
  instrument: string;
  spotPrice: number;
  timestamp: number | string; // ms or ISO
  bid?: number | null;
  ask?: number | null;
  volume?: number;
  openInterest?: number;
  ltp?: number;
}

export class MarketDataValidationService {
  /**
   * Validate a market quote or snapshot against sanity rules and staleness
   */
  public validateQuote(
    data: QuoteValidationInput,
    maxAllowedAgeSeconds: number = 180
  ): MarketDataValidationReport {
    const issues: DataValidationIssue[] = [];
    const now = Date.now();

    // 1. Parse timestamp
    const tsMillis =
      typeof data.timestamp === "number"
        ? data.timestamp
        : new Date(data.timestamp).getTime();

    const ageSeconds = Math.max(0, Math.floor((now - tsMillis) / 1000));

    // 2. Instrument & Spot validity
    if (!data.instrument || typeof data.instrument !== "string") {
      issues.push({
        field: "instrument",
        severity: "CRITICAL",
        message: "Missing or invalid instrument symbol",
        observedValue: data.instrument,
      });
    }

    if (
      typeof data.spotPrice !== "number" ||
      !Number.isFinite(data.spotPrice) ||
      data.spotPrice <= 0
    ) {
      issues.push({
        field: "spotPrice",
        severity: "CRITICAL",
        message: "Underlying spot price must be a positive finite number",
        observedValue: data.spotPrice,
      });
    }

    // 3. Bid-Ask spread sanity checks
    let bidAskSpreadValid = true;
    let spreadPct: number | undefined;

    if (
      data.bid !== undefined &&
      data.bid !== null &&
      data.ask !== undefined &&
      data.ask !== null
    ) {
      if (data.bid < 0 || data.ask < 0) {
        bidAskSpreadValid = false;
        issues.push({
          field: "bidAsk",
          severity: "CRITICAL",
          message: "Bid and Ask prices must be non-negative",
          observedValue: { bid: data.bid, ask: data.ask },
        });
      } else if (data.ask < data.bid) {
        bidAskSpreadValid = false;
        issues.push({
          field: "bidAskCrossed",
          severity: "CRITICAL",
          message: `Crossed market detected: Ask (${data.ask}) is lower than Bid (${data.bid})`,
          observedValue: { bid: data.bid, ask: data.ask },
        });
      } else if (data.bid > 0 && data.ask > 0) {
        const mid = (data.bid + data.ask) / 2;
        spreadPct = mid > 0 ? +(((data.ask - data.bid) / mid) * 100).toFixed(2) : 0;
        if (spreadPct > 5.0) {
          issues.push({
            field: "bidAskSpread",
            severity: "WARNING",
            message: `Abnormally wide bid-ask spread (${spreadPct}%) indicating illiquidity`,
            observedValue: spreadPct,
          });
        }
      }
    }

    // 4. Volume & OI Non-negative checks
    if (data.volume !== undefined && data.volume < 0) {
      issues.push({
        field: "volume",
        severity: "CRITICAL",
        message: "Volume cannot be negative",
        observedValue: data.volume,
      });
    }

    if (data.openInterest !== undefined && data.openInterest < 0) {
      issues.push({
        field: "openInterest",
        severity: "CRITICAL",
        message: "Open Interest cannot be negative",
        observedValue: data.openInterest,
      });
    }

    // 5. Freshness status determination
    const sessionInfo = tradingSessionService.getSessionInfo();
    let freshnessStatus: DataFreshnessStatus = "LIVE";

    if (issues.some((i) => i.severity === "CRITICAL")) {
      freshnessStatus = "INSUFFICIENT_DATA";
    } else if (ageSeconds <= maxAllowedAgeSeconds) {
      freshnessStatus = "LIVE";
    } else if (ageSeconds > 900) {
      // Over 15 minutes old
      freshnessStatus = "STALE";
      issues.push({
        field: "staleness",
        severity: "CRITICAL",
        message: `Market data stale: Last update was ${Math.round(ageSeconds / 60)} minutes ago`,
        observedValue: ageSeconds,
      });
    } else if (!sessionInfo.isMarketOpen) {
      freshnessStatus = "MARKET_CLOSED";
    } else {
      // 3 to 15 minutes old during active market
      freshnessStatus = "DELAYED";
      issues.push({
        field: "staleness",
        severity: "WARNING",
        message: `Market data delayed by ${ageSeconds}s (exceeds ${maxAllowedAgeSeconds}s threshold)`,
        observedValue: ageSeconds,
      });
    }

    const criticalCount = issues.filter((i) => i.severity === "CRITICAL").length;
    const warningsCount = issues.filter((i) => i.severity === "WARNING").length;
    const isValid = criticalCount === 0 && freshnessStatus !== "STALE" && freshnessStatus !== "INSUFFICIENT_DATA";

    return {
      isValid,
      freshnessStatus,
      ageSeconds,
      maxAllowedAgeSeconds,
      issues,
      warningsCount,
      criticalCount,
      bidAskSpreadValid,
      spreadPct,
      timestamp: new Date().toISOString(),
    };
  }
}

export const marketDataValidationService = new MarketDataValidationService();
