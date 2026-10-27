/**
 * Deterministic F&O fixtures for engine / scoring tests.
 *
 * These are TEST DATA used to exercise the integrity gates; flags such as `isSimulated` are set
 * explicitly per test to model "live broker" vs "simulated baseline" inputs.
 */

import type { FnoMarketSnapshot, SynchronizedGreeksSnapshot } from "../../services/index.ts";
import type {
  NormalizedOptionLeg,
  NormalizedOptionRow,
} from "../../options-data-provider.server.ts";
import type { WorkstationBar } from "../../terminal-workstation.functions.ts";

export const FIXTURE_STRIKES = [22750, 22800, 22850, 22900, 22950, 23000, 23050, 23100, 23150];

/** Steadily rising 5-minute candles ending at `endMs`; final close = 22800 + (n - 1) * 2. */
export function makeUptrendBars(n: number, endMs: number): WorkstationBar[] {
  const endSec = Math.floor(endMs / 1000);
  const bars: WorkstationBar[] = [];
  for (let i = 0; i < n; i++) {
    const close = 22800 + i * 2;
    bars.push({
      time: endSec - (n - 1 - i) * 300,
      open: close - 1,
      high: close + 1.5,
      low: close - 2,
      close,
      volume: 1000 + i,
    });
  }
  return bars;
}

function makeLeg(
  type: "CE" | "PE",
  strike: number,
  ltp: number,
  atm: boolean,
  quote: { bid: number | null; ask: number | null },
): NormalizedOptionLeg {
  const delta = type === "CE" ? 0.52 : -0.48;
  return {
    instrumentIdentifier: `NIFTY-${strike}-${type}`,
    type,
    strikePrice: strike,
    ltp,
    bid: quote.bid,
    bidQty: 1000,
    ask: quote.ask,
    askQty: 1000,
    volume: 50000,
    openInterest: atm ? 900000 : 400000,
    prevOpenInterest: 380000,
    oiChange: 20000,
    oiChangePct: 5,
    impliedVolatility: 14.5,
    delta,
    gamma: 0.0012,
    theta: -10,
    vega: 8,
    rho: 0.02,
    greeks: {
      delta,
      gamma: 0.0012,
      theta: -10,
      thetaPerDay: -10,
      vega: 8,
      vegaPerPoint: 8,
      rho: 0.02,
      iv: 0.145,
      impliedVolatility: 14.5,
      intrinsicValue: 0,
      timeValue: ltp,
    },
    greeksSource: "PROVIDER_SUPPLIED",
    isItm: false,
    isAtm: atm,
  };
}

export interface SnapshotOptions {
  nowMs: number;
  simulated?: boolean;
  bars?: WorkstationBar[];
  /** Override bid/ask for the ATM legs (e.g. null to model a missing quote). */
  atmQuote?: { bid: number | null; ask: number | null };
}

export function makeSnapshot(opts: SnapshotOptions): FnoMarketSnapshot {
  const bars = opts.bars ?? makeUptrendBars(80, opts.nowMs);
  const spot = bars.length > 0 ? bars[bars.length - 1].close : 22958;
  const atmStrike = Math.round(spot / 50) * 50;
  const nowIso = new Date(opts.nowMs).toISOString();

  const rows: NormalizedOptionRow[] = FIXTURE_STRIKES.map((strike) => {
    const atm = strike === atmStrike;
    const ltp = atm ? 40 : 30;
    const quote =
      atm && opts.atmQuote
        ? opts.atmQuote
        : { bid: +(ltp - 0.1).toFixed(2), ask: +(ltp + 0.1).toFixed(2) };
    const call = makeLeg("CE", strike, ltp, atm, quote);
    const put = makeLeg("PE", strike, ltp, atm, quote);
    return { strike, isAtm: atm, call, put, ce: call, pe: put };
  });

  const simulated = opts.simulated ?? false;
  return {
    instrument: "NIFTY 50",
    underlyingPrice: spot,
    futuresPrice: null,
    futuresVolume: null,
    expiryDate: "2026-10-29",
    availableExpiries: ["2026-10-29"],
    atmStrike,
    daysToExpiry: 5,
    pcr: 1.3,
    pcrDefinition: "Total Put OI / Total Call OI",
    maxPainStrike: atmStrike,
    totalCallOi: 4000000,
    totalPutOi: 5200000,
    totalCallVolume: 400000,
    totalPutVolume: 380000,
    rows,
    bars,
    barsSource: bars.length > 0 ? "YAHOO_5M" : "UNAVAILABLE",
    barsLastAt: bars.length > 0 ? new Date(bars[bars.length - 1].time * 1000).toISOString() : null,
    barsError: bars.length > 0 ? undefined : "no candles",
    provider: simulated ? "Internal Baseline" : "DhanHQ v2",
    providerStatus: {
      providerName: "DhanHQ",
      isAuthorized: !simulated,
      status: simulated ? "CONFIG_MISSING" : "ACTIVE",
      reason: "fixture",
      documentationUrl: "https://dhanhq.co/docs/v2/",
      canStreamLiveData: !simulated,
    },
    isSimulated: simulated,
    dataSource: simulated ? "SIMULATED_BASELINE" : "LIVE_BROKER",
    chainTimestamp: nowIso,
    validation: {
      isValid: true,
      freshnessStatus: "LIVE",
      ageSeconds: 1,
      maxAllowedAgeSeconds: 180,
      issues: [],
      warningsCount: 0,
      criticalCount: 0,
      bidAskSpreadValid: true,
      timestamp: nowIso,
    },
    timestamp: nowIso,
    cacheTtlMs: 3000,
  };
}

export function makeGreeksSnapshot(
  snapshot: FnoMarketSnapshot,
  opts: { simulated?: boolean } = {},
): SynchronizedGreeksSnapshot {
  const simulated = opts.simulated ?? false;
  const points = FIXTURE_STRIKES.map((strike) => ({
    strike,
    callDelta: 0.55,
    putDelta: -0.43,
    callGamma: 0.0012,
    putGamma: 0.0012,
    callTheta: -10,
    putTheta: -9,
    callVega: 8,
    putVega: 8,
    callIv: 14.5,
    putIv: 15,
    callLtp: strike === snapshot.atmStrike ? 40 : 30,
    putLtp: strike === snapshot.atmStrike ? 40 : 30,
    isAtm: strike === snapshot.atmStrike,
    isItmCall: strike < snapshot.underlyingPrice,
    isItmPut: strike > snapshot.underlyingPrice,
  }));
  return {
    instrument: snapshot.instrument,
    underlyingPrice: snapshot.underlyingPrice,
    expiryDate: snapshot.expiryDate,
    atmStrike: snapshot.atmStrike,
    daysToExpiry: 5,
    provider: simulated ? "Sensibull Greeks Engine (Calibrated Live Feed)" : "Sensibull Direct API",
    authorizationStatus: {
      providerName: "Sensibull",
      isAuthorized: !simulated,
      status: simulated ? "UNAUTHORIZED_OR_UNAVAILABLE" : "ACTIVE",
      reason: "fixture",
      documentationUrl: "https://sensibull.com",
      canStreamLiveData: !simulated,
    },
    isDirectSensibullAuthorized: !simulated,
    isSimulated: simulated,
    dataSource: simulated ? "SIMULATED_BLACK_SCHOLES" : "LIVE_SENSIBULL",
    points,
    velocity: [],
    velocityAvailable: true,
    summary: {
      atmCallDelta: 0.55,
      atmPutDelta: -0.43,
      peakGamma: 0.0012,
      peakGammaStrike: snapshot.atmStrike,
      maxThetaBurn: 10,
      maxThetaStrike: snapshot.atmStrike,
      atmIv: 14.5,
    },
    timestamp: snapshot.timestamp,
  };
}
