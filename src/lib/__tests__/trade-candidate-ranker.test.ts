import test from "node:test";
import assert from "node:assert/strict";
import {
  rankTradeCandidates,
  type RiskConstraintsConfig,
} from "../trade-candidate-ranker.ts";
import type { NormalizedOptionChain } from "../options-data-provider.server.ts";

function createMockOptionChain(): NormalizedOptionChain {
  const strikes = [24800, 24900, 25000, 25100, 25200];
  const rows = strikes.map((strike) => {
    const isAtm = strike === 25000;
    return {
      strike,
      isAtm,
      call: {
        instrumentIdentifier: `NIFTY26OCT${strike}CE`,
        type: "CE" as const,
        strikePrice: strike,
        ltp: isAtm ? 145 : strike < 25000 ? 280 : 65,
        bid: 144,
        bidQty: 1800,
        ask: 146,
        askQty: 2400,
        volume: 850000,
        openInterest: 4200000,
        prevOpenInterest: 3900000,
        oiChange: 300000,
        oiChangePct: 7.69,
        impliedVolatility: 14.5,
        delta: isAtm ? 0.52 : strike < 25000 ? 0.75 : 0.3,
        gamma: 0.00045,
        theta: -12.5,
        vega: 18.2,
        rho: 0.04,
        greeks: {
          delta: isAtm ? 0.52 : strike < 25000 ? 0.75 : 0.3,
          gamma: 0.00045,
          theta: -12.5,
          thetaPerDay: -12.5,
          vega: 18.2,
          vegaPerPoint: 18.2,
          rho: 0.04,
          iv: 14.5,
          impliedVolatility: 14.5,
          intrinsicValue: 0,
          timeValue: 145,
        },
        greeksSource: "CALCULATED_BLACK_SCHOLES" as const,
        isItm: strike < 25000,
        isAtm,
      },
      put: {
        instrumentIdentifier: `NIFTY26OCT${strike}PE`,
        type: "PE" as const,
        strikePrice: strike,
        ltp: isAtm ? 138 : strike < 25000 ? 55 : 265,
        bid: 137,
        bidQty: 2100,
        ask: 139,
        askQty: 1900,
        volume: 720000,
        openInterest: 3800000,
        prevOpenInterest: 3600000,
        oiChange: 200000,
        oiChangePct: 5.55,
        impliedVolatility: 15.2,
        delta: isAtm ? -0.48 : strike < 25000 ? -0.25 : -0.7,
        gamma: 0.00045,
        theta: -11.8,
        vega: 18.0,
        rho: -0.04,
        greeks: {
          delta: isAtm ? -0.48 : strike < 25000 ? -0.25 : -0.7,
          gamma: 0.00045,
          theta: -11.8,
          thetaPerDay: -11.8,
          vega: 18.0,
          vegaPerPoint: 18.0,
          rho: -0.04,
          iv: 15.2,
          impliedVolatility: 15.2,
          intrinsicValue: 0,
          timeValue: 138,
        },
        greeksSource: "CALCULATED_BLACK_SCHOLES" as const,
        isItm: strike > 25000,
        isAtm,
      },
      ce: null as any,
      pe: null as any,
    };
  });

  // Link ce/pe aliases
  rows.forEach((r) => {
    r.ce = r.call;
    r.pe = r.put;
  });

  return {
    symbol: "NIFTY 50",
    underlyingPrice: 25000,
    expiryDate: "2026-10-22",
    availableExpiries: ["2026-10-22"],
    atmStrike: 25000,
    daysToExpiry: 2,
    timestamp: new Date().toISOString(),
    pcr: 1.15,
    pcrDefinition: "Put OI / Call OI",
    maxPain: 25000,
    maxPainStrike: 25000,
    totalCallOi: 18500000,
    totalPutOi: 21275000,
    totalCallVolume: 4200000,
    totalPutVolume: 3900000,
    rows,
    strikes: rows,
    provider: "Internal Baseline",
    providerTimestamp: Date.now(),
    retrievedAt: Date.now(),
    freshnessStatus: "LIVE",
    dataQualityNotes: ["Calibrated baseline mock feed"],
  };
}

test("rankTradeCandidates generates and ranks candidates during trending market", () => {
  const chain = createMockOptionChain();
  const result = rankTradeCandidates(
    "NIFTY 50",
    chain,
    25045, // Spot up +0.45%
    0.45,
    75, // Lot size
    65, // Bullish macro sentiment
    0, // No high-impact events
  );

  assert.ok(result.rankedCandidates.length > 0, "Should generate passing trade candidates");
  const top = result.topRecommendation;
  assert.ok(top);
  assert.equal(top.rank, 1);
  assert.ok(top.compositeScore >= 60, "Top candidate should pass score threshold");
  assert.ok(top.riskGateChecks.passed, "Top candidate must pass all hard risk gates");
  assert.equal(result.noTradeDecision, null, "Should not trigger NO TRADE when setups are valid");
});

test("rankTradeCandidates triggers explicit NO TRADE decision during high event risk", () => {
  const chain = createMockOptionChain();
  const result = rankTradeCandidates(
    "NIFTY 50",
    chain,
    25000,
    0.02,
    75,
    30, // Adverse sentiment
    4, // 4 High-impact macro events -> triggers EVENT_DRIVEN regime
  );

  assert.ok(result.noTradeDecision, "Must trigger NO TRADE during high event risk");
  assert.equal(result.noTradeDecision.isNoTrade, true);
  assert.ok(result.noTradeDecision.capitalPreservationMessage.length > 0);
  assert.ok(result.noTradeDecision.reevaluationTriggers.length > 0);
  assert.equal(result.topRecommendation, null, "No candidate should be recommended during NO TRADE");
});
