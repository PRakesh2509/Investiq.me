import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTradeScore,
  DEFAULT_SCORING_WEIGHTS,
  type TradeScoringInput,
} from "../trade-scoring-service.ts";

describe("TradeScoringService — 7-Factor Model", () => {
  test("Weights sum to exactly 1.0", () => {
    const sum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.0001, `Weights sum should be 1.0, got ${sum}`);
  });

  test("Calculates complete score with all 7 factors present and valid", () => {
    const input: TradeScoringInput = {
      instrument: "NIFTY 50",
      spotPrice: 22862.9,
      changePct: 0.45,
      intendedDirection: "CALL",
      technical: {
        rsi: 61.2,
        ema9: 22840,
        ema21: 22800,
        vwap: 22810,
        supertrendBullish: true,
        dataTimestamp: Date.now(),
      },
      greeks: {
        delta: 0.52,
        gamma: 0.0018,
        thetaPerDay: -14.2,
        vegaPerPoint: 8.5,
        iv: 0.142,
        daysToExpiry: 4.5,
        strike: 22850,
        isAtm: true,
        dataTimestamp: Date.now(),
      },
      openInterest: {
        pcr: 1.28,
        maxPainStrike: 22800,
        dataTimestamp: Date.now(),
      },
      macroSentiment: {
        sentimentScore: 0.35,
        verifiedHeadlinesCount: 6,
        highImpactEventsCount: 0,
        dataTimestamp: Date.now(),
      },
      liquidity: {
        bidAskSpreadPct: 0.3,
        avgLotVolume: 45000,
        dataTimestamp: Date.now(),
      },
      performance: {
        winRatePct: 70,
        profitFactor: 1.9,
        sampleSignalsCount: 52,
      },
    };

    const res = calculateTradeScore(input);

    assert.equal(res.factorBreakdown.length, 7, "Must contain all 7 factor breakdowns");
    assert.ok(res.overallScore >= 65 && res.overallScore <= 98, `Overall score should be high, got ${res.overallScore}`);
    assert.equal(res.marketBias, "BULLISH");
    assert.equal(res.dataQuality, "LIVE_VERIFIED");
    assert.ok(res.confidenceLevel >= 75);
    assert.ok(res.supportingBullishFactors.length > 0);
    assert.ok(res.allHardRiskPassed, "All hard risk checks should pass for standard DTE and spread");
    assert.ok(res.explanation.includes("Score:"));
  });

  test("Missing data explicitly penalizes score and marks data quality as PARTIAL or INSUFFICIENT", () => {
    const sparseInput: TradeScoringInput = {
      instrument: "NIFTY 50",
      spotPrice: 22862.9,
      changePct: -0.1,
      intendedDirection: "PUT",
    };

    const res = calculateTradeScore(sparseInput);

    assert.ok(
      res.dataQuality === "PARTIAL_INPUTS" || res.dataQuality === "INSUFFICIENT_DATA",
      `Expected dataQuality to flag missing inputs, got ${res.dataQuality}`
    );
    assert.ok(res.confidenceLevel < 70, `Confidence should be reduced due to missing factors, got ${res.confidenceLevel}`);
    const missingFactors = res.factorBreakdown.filter((f) => f.status === "MISSING_DATA");
    assert.ok(missingFactors.length >= 3, `Should identify multiple missing factors, got ${missingFactors.length}`);
  });

  test("Expiry day gamma risk triggers a failed hard risk check without breaking score calculation", () => {
    const expiryDayInput: TradeScoringInput = {
      instrument: "BANK NIFTY",
      spotPrice: 51240,
      changePct: 0.2,
      intendedDirection: "CALL",
      greeks: {
        delta: 0.48,
        gamma: 0.008,
        thetaPerDay: -45,
        iv: 0.16,
        daysToExpiry: 0.05, // ~1.2 hours left
        strike: 51200,
        dataTimestamp: Date.now(),
      },
      liquidity: {
        bidAskSpreadPct: 3.2, // wide spread
      },
    };

    const res = calculateTradeScore(expiryDayInput);

    const gammaRisk = res.riskChecks.find((r) => r.id === "risk_gamma");
    assert.ok(gammaRisk, "Should have gamma risk check");
    assert.equal(gammaRisk.passed, false, "Expiry day gamma risk should fail");
    assert.equal(gammaRisk.severity, "CRITICAL");

    const spreadRisk = res.riskChecks.find((r) => r.id === "risk_spread");
    assert.ok(spreadRisk, "Should have spread risk check");
    assert.equal(spreadRisk.passed, false, "3.2% spread should fail 2.5% tolerance");

    assert.equal(res.allHardRiskPassed, false, "allHardRiskPassed should be false when critical checks fail");
  });
});
