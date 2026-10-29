import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  tradingSessionService,
  marketDataValidationService,
  optionsGreeksDataService,
  greeksAnalysisService,
  fnoSignalAnalysisService,
  marketRiskService,
  tradeCandidateService,
  fnoMarketDataService,
} from "../services/index.ts";

// Production never fabricates option data: without a broker feed the providers report
// "unavailable". These service tests exercise the pipeline against the model chain that the
// provider layer only emits (and clearly flags `isSimulated`) when ALLOW_MOCK_DATA === "true".
const previousAllowMock = process.env.ALLOW_MOCK_DATA;
before(() => {
  process.env.ALLOW_MOCK_DATA = "true";
});
after(() => {
  if (previousAllowMock === undefined) delete process.env.ALLOW_MOCK_DATA;
  else process.env.ALLOW_MOCK_DATA = previousAllowMock;
});

describe("Phase 1 & 7: Trading Session Controls (tradingSessionService)", () => {
  test("Accurately identifies weekend as closed", () => {
    // Saturday: 2026-10-24 11:00 AM IST
    const saturday = new Date("2026-10-24T05:30:00.000Z"); // 11:00 AM IST
    const session = tradingSessionService.getSessionInfo(saturday);

    assert.equal(session.isMarketOpen, false);
    assert.equal(session.phase, "WEEKEND");
    assert.equal(session.canGenerateFreshCandidates, false);
  });

  test("Accurately identifies official NSE Holiday", () => {
    // Republic Day 2026-01-26
    const holidayDate = new Date("2026-01-26T05:30:00.000Z");
    const session = tradingSessionService.getSessionInfo(holidayDate);

    assert.equal(session.isMarketOpen, false);
    assert.equal(session.phase, "HOLIDAY");
    assert.ok(session.sessionText.includes("Republic Day"));
  });

  test("Identifies active live market session during weekday trading hours (09:15 to 15:30 IST)", () => {
    // Wednesday 2026-10-21 11:00 AM IST (05:30 UTC)
    const midMarket = new Date("2026-10-21T05:30:00.000Z");
    const session = tradingSessionService.getSessionInfo(midMarket);

    assert.equal(session.isMarketOpen, true);
    assert.equal(session.phase, "NORMAL_SESSION");
    assert.equal(session.canGenerateFreshCandidates, true);
  });

  test("Flags zero-DTE afternoon expiry risk after 13:30 IST on Thursday", () => {
    // Thursday 2026-10-22 14:00 IST (08:30 UTC)
    const expiryAfternoon = new Date("2026-10-22T08:30:00.000Z");
    const session = tradingSessionService.getSessionInfo(expiryAfternoon);

    assert.equal(session.isMarketOpen, true);
    assert.equal(session.isExpiryAfternoon, true);
  });
});

describe("Phase 2 & 9: Market Data Validation & Stale Data Detection (marketDataValidationService)", () => {
  test("Marks recent quote with valid bid-ask spread as LIVE and valid", () => {
    const report = marketDataValidationService.validateQuote({
      instrument: "NIFTY 50",
      spotPrice: 22862.9,
      timestamp: Date.now() - 5000, // 5s ago
      bid: 125.0,
      ask: 125.5,
      volume: 10000,
      openInterest: 50000,
    });

    assert.ok(report.isValid);
    assert.equal(report.freshnessStatus, "LIVE");
    assert.equal(report.criticalCount, 0);
    assert.ok(report.spreadPct! < 1.0);
  });

  test("Rejects crossed market (Ask < Bid) as CRITICAL issue", () => {
    const report = marketDataValidationService.validateQuote({
      instrument: "NIFTY 50",
      spotPrice: 22862.9,
      timestamp: Date.now(),
      bid: 130.0,
      ask: 125.0, // Crossed
    });

    assert.equal(report.isValid, false);
    assert.equal(report.bidAskSpreadValid, false);
    assert.ok(report.issues.some((i) => i.field === "bidAskCrossed"));
  });

  test("Detects stale data exceeding threshold (>180s)", () => {
    const report = marketDataValidationService.validateQuote({
      instrument: "NIFTY 50",
      spotPrice: 22862.9,
      timestamp: Date.now() - 1200_000, // 20 minutes ago
    });

    assert.equal(report.isValid, false);
    assert.equal(report.freshnessStatus, "STALE");
  });
});

describe("Phase 1 & 2: Options Greeks Ingestion & Velocity Tracking (optionsGreeksDataService)", () => {
  test("Ingests Greeks snapshot and synchronizes 21 strike levels", async () => {
    const snapshot = await optionsGreeksDataService.getGreeksSnapshot("NIFTY 50");

    assert.ok(snapshot);
    assert.equal(snapshot.instrument, "NIFTY 50");
    assert.ok(snapshot.underlyingPrice > 10000);
    assert.ok(snapshot.points.length >= 21);
    assert.ok(snapshot.summary.atmCallDelta >= 0.4 && snapshot.summary.atmCallDelta <= 0.6);
    assert.ok(snapshot.provider.includes("Sensibull"));
  });

  test("Tracks Greeks velocity between consecutive snapshots", async () => {
    // Initial snapshot
    await optionsGreeksDataService.getGreeksSnapshot("BANK NIFTY");
    // Second snapshot
    const second = await optionsGreeksDataService.getGreeksSnapshot("BANK NIFTY");

    assert.ok(second.velocity.length >= 21);
    assert.equal(typeof second.velocity[0].deltaChange, "number");
    assert.equal(typeof second.velocity[0].gammaChange, "number");
  });
});

describe("Phase 3: Greeks Analysis & Strategy Suitability (greeksAnalysisService)", () => {
  test("Correctly analyzes Delta, Gamma, Theta decay and IV skew", async () => {
    const greeksSnapshot = await optionsGreeksDataService.getGreeksSnapshot("NIFTY 50");
    const report = greeksAnalysisService.analyzeGreeks(greeksSnapshot);

    assert.ok(report);
    assert.ok(report.gammaAnalysis.peakGamma > 0);
    assert.ok(report.thetaAnalysis.atmDailyDecayPerShare > 0);
    assert.ok(
      ["VOLATILITY_ELEVATED", "VOLATILITY_NORMAL", "VOLATILITY_COMPRESSED"].includes(
        report.vegaAnalysis.ivRegime,
      ),
    );
    assert.ok(report.strategySuitability.reasons.length > 0);
  });
});

describe("Phase 3: Combined F&O Signal Analysis (fnoSignalAnalysisService)", () => {
  test("Fuses technical price action, options positioning, and Greeks into explainable score", async () => {
    const marketSnapshot = await fnoMarketDataService.getMarketSnapshot("NIFTY 50");
    const greeksSnapshot = await optionsGreeksDataService.getGreeksSnapshot("NIFTY 50");
    const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);

    const combined = fnoSignalAnalysisService.analyzeCombinedSignal(marketSnapshot, greeksReport);

    assert.ok(combined);
    assert.ok(combined.confluenceScore >= 0 && combined.confluenceScore <= 100);
    assert.ok(combined.technical.trend);
    assert.ok(combined.positioning.oiBuildup);
    assert.ok(Array.isArray(combined.confluenceFactors));
    assert.ok(combined.primaryObservation.length > 0);
  });
});

describe("Phase 5: Market Risk Service & Regulatory Cost Accounting (marketRiskService)", () => {
  test("Calculates complete statutory transaction costs (brokerage, STT, GST, turnover, slippage)", () => {
    const costs = marketRiskService.calculateTransactionCosts(
      150.0, // ₹150 premium
      25, // Nifty lot size
      2, // 2 lots = 50 shares
      false,
    );

    assert.ok(costs.brokerage === 40); // 2 orders * ₹20
    assert.ok(costs.stt > 0);
    assert.ok(costs.exchangeTurnoverFee > 0);
    assert.ok(costs.gst > 0);
    assert.ok(costs.totalEstimatedCost > 40);
  });

  test("Hard gate: Rejects candidate if max risk exceeds capital risk budget", () => {
    const riskReport = marketRiskService.evaluateRisk({
      instrument: "NIFTY 50",
      strategy: "LONG_CALL",
      strike: 22850,
      entryPremium: 200,
      stopLossPremium: 50, // ₹150 risk per share * 100 shares = ₹15,000 risk!
      targetPremium: 350,
      lots: 4, // 100 shares
      bidAskSpreadPct: 0.5,
      daysToExpiry: 2,
      accountCapital: 20000,
      maxRiskPerTradePct: 2.0, // Max ₹400 allowed!
    });

    assert.equal(riskReport.passed, false);
    assert.equal(riskReport.verdict, "REJECTED_RISK_GATE_FAILURE");
    assert.ok(riskReport.rejectionReasons.some((r) => r.includes("exceeds maximum risk budget")));
  });

  test("Hard gate: Rejects illiquid strike with wide bid-ask spread (> 2.5%)", () => {
    const riskReport = marketRiskService.evaluateRisk({
      instrument: "NIFTY 50",
      strategy: "LONG_CALL",
      strike: 22850,
      entryPremium: 50,
      stopLossPremium: 40,
      targetPremium: 75,
      lots: 1,
      bidAskSpreadPct: 4.8, // Excessively wide spread
      daysToExpiry: 2,
      accountCapital: 50000,
      maxRiskPerTradePct: 2.0,
    });

    assert.equal(riskReport.passed, false);
    assert.ok(riskReport.rejectionReasons.some((r) => r.includes("exceeds liquidity threshold")));
  });
});

describe("Phase 4 & 6: Trade Candidate Engine & Lifecycle Monitoring (tradeCandidateService)", () => {
  test("Generates explainable trade candidates with full required schema and position sizing", async () => {
    const marketSnapshot = await fnoMarketDataService.getMarketSnapshot("NIFTY 50");
    const greeksSnapshot = await optionsGreeksDataService.getGreeksSnapshot("NIFTY 50");
    const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
    const combined = fnoSignalAnalysisService.analyzeCombinedSignal(marketSnapshot, greeksReport);

    const result = tradeCandidateService.evaluateCandidates(
      marketSnapshot,
      greeksReport,
      combined,
      50000, // ₹50,000 capital
      2.0, // 2% risk budget
    );

    assert.ok(result);
    assert.equal(result.instrument, "NIFTY 50");

    if (result.activeCandidates.length > 0) {
      const candidate = result.activeCandidates[0];
      assert.ok(candidate.id);
      assert.ok(candidate.strategyType);
      assert.ok(candidate.entryZone.min > 0);
      assert.ok(candidate.stopLoss > 0);
      assert.ok(candidate.targetLevels.t1 > 0);
      assert.ok(candidate.riskRewardRatio > 0);
      assert.ok(candidate.positionSizing.recommendedLots >= 1);
      assert.ok(candidate.greeksAndIvContext);
      assert.ok(candidate.reasonsSupporting.length > 0);
      assert.ok(candidate.reasonsAgainst.length > 0);
      assert.equal(candidate.lifecycleStatus, "CONFIRMED");
      assert.ok(candidate.scoringMethodology.scoreFactors.length >= 4);
    } else {
      // If market is neutral or risk gate triggered, verify explicit NO_TRADE report
      assert.ok(result.noTradeDecision);
      assert.equal(result.noTradeDecision.isNoTrade, true);
      assert.ok(result.noTradeDecision.headline.includes("NO TRADE"));
      assert.ok(result.noTradeDecision.capitalPreservationMessage.length > 0);
    }
  });

  test("Never produces candidates from a simulated option chain", async () => {
    const marketSnapshot = await fnoMarketDataService.getMarketSnapshot("NIFTY 50");
    const greeksSnapshot = await optionsGreeksDataService.getGreeksSnapshot("NIFTY 50");
    assert.equal(marketSnapshot.isSimulated, true, "mock-mode chain must be flagged simulated");
    assert.equal(greeksSnapshot.isSimulated, true);

    const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
    const combined = fnoSignalAnalysisService.analyzeCombinedSignal(marketSnapshot, greeksReport);
    const result = tradeCandidateService.evaluateCandidates(marketSnapshot, greeksReport, combined);

    assert.equal(result.activeCandidates.length, 0);
    assert.ok(result.noTradeDecision);
    assert.equal(result.noTradeDecision.isNoTrade, true);
  });

  test("Emits explicit NO_TRADE when market data is stale or invalid", async () => {
    const marketSnapshot = await fnoMarketDataService.getMarketSnapshot("NIFTY 50");
    // Force stale validation
    marketSnapshot.validation.isValid = false;
    marketSnapshot.validation.freshnessStatus = "STALE";
    marketSnapshot.validation.issues = [
      { field: "staleness", severity: "CRITICAL", message: "Stale data feed" },
    ];

    const greeksSnapshot = await optionsGreeksDataService.getGreeksSnapshot("NIFTY 50");
    const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
    const combined = fnoSignalAnalysisService.analyzeCombinedSignal(marketSnapshot, greeksReport);

    const result = tradeCandidateService.evaluateCandidates(marketSnapshot, greeksReport, combined);

    assert.equal(result.activeCandidates.length, 0);
    assert.ok(result.noTradeDecision);
    assert.equal(result.noTradeDecision.reasonCode, "DATA_STALE_OR_INSUFFICIENT");
  });
});
