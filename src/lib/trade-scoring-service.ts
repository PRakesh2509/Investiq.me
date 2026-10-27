/**
 * AI Trade Scoring Engine — InvestIQ F&O
 *
 * Implements a 7-factor explainable scoring model with configurable weights:
 * 1. Technical Analysis: 20%
 * 2. Options Greeks & Strategy Suitability: 20%
 * 3. Implied Volatility & Volatility Conditions: 15%
 * 4. Open Interest & Strike Positioning: 10%
 * 5. Verified News & Macroeconomic Context: 15%
 * 6. Liquidity & Transaction Costs: 10%
 * 7. Validated Strategy Historical Performance: 10%
 *
 * HARD SEPARATION PRINCIPLES:
 * - Numerical trade score (0-100) is distinct from Hard Risk Gates. A high score NEVER overrides a failed risk check.
 * - Score is NOT a "probability of profit"; it is an algorithmic confluence rating.
 * - NO FABRICATED INPUTS: a factor whose data is missing (or flagged simulated) is marked
 *   unavailable (`available: false`, status MISSING_DATA), contributes nothing, and is never
 *   replaced by a placeholder number. The overall score is computed over the available weight
 *   only and is CAPPED according to how much of the model has real data behind it. The
 *   execution-critical factors (technical, Greeks, IV, OI, liquidity) are additionally enforced
 *   by a hard "data integrity" risk gate: if any is missing, simulated or stale the gates FAIL.
 */

export interface ScoringWeights {
  technicalAnalysis: number; // default 0.20
  optionsGreeks: number; // default 0.20
  impliedVolatility: number; // default 0.15
  openInterest: number; // default 0.10
  macroNews: number; // default 0.15
  liquidityCost: number; // default 0.10
  strategyPerformance: number; // default 0.10
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  technicalAnalysis: 0.2,
  optionsGreeks: 0.2,
  impliedVolatility: 0.15,
  openInterest: 0.1,
  macroNews: 0.15,
  liquidityCost: 0.1,
  strategyPerformance: 0.1,
};

export interface FactorBreakdown {
  id: string;
  name: string;
  weight: number; // e.g. 0.20
  /** 0-100 normalized score for this factor; 0 when the factor is unavailable. */
  score: number;
  weightedContribution: number; // score * weight (0 when unavailable)
  status: "OPTIMAL" | "MODERATE" | "ADVERSE" | "MISSING_DATA" | "STALE";
  /** False when the factor had no real data (missing or simulated) and was excluded. */
  available: boolean;
  evidence: string;
  rationale: string;
}

export interface HardRiskCheck {
  id: string;
  name: string;
  passed: boolean;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  rule: string;
  observedValue: string;
  mitigation: string;
}

export type MarketBias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type DataFreshnessStatus =
  "LIVE_VERIFIED" | "STALE" | "PARTIAL_INPUTS" | "INSUFFICIENT_DATA";

export type FactorDataState = "REAL" | "UNAVAILABLE" | "SIMULATED" | "STALE";

export interface TradeScoringInput {
  instrument: string;
  spotPrice: number;
  changePct?: number;
  intendedDirection: "CALL" | "PUT" | "NEUTRAL";
  timeframe?: string;
  // Technical factors
  technical?: {
    rsi?: number;
    ema9?: number;
    ema21?: number;
    vwap?: number;
    supertrendBullish?: boolean;
    dataTimestamp?: number;
    /** True when the inputs are not derived from real market data. */
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  };
  // Options Greeks & contract
  greeks?: {
    delta?: number;
    gamma?: number;
    thetaPerDay?: number;
    vegaPerPoint?: number;
    iv?: number;
    daysToExpiry?: number;
    strike?: number;
    isAtm?: boolean;
    dataTimestamp?: number;
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  };
  // Positioning & OI
  openInterest?: {
    pcr?: number;
    maxPainStrike?: number;
    callOiChangeTotal?: number;
    putOiChangeTotal?: number;
    dataTimestamp?: number;
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  };
  // Macro & News sentiment
  macroSentiment?: {
    sentimentScore?: number; // -1.0 (very bearish) to +1.0 (very bullish)
    verifiedHeadlinesCount?: number;
    highImpactEventsCount?: number;
    dataTimestamp?: number;
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  };
  // Liquidity & slippage
  liquidity?: {
    bidAskSpreadPct?: number; // e.g. 0.2% or 2.5%
    avgLotVolume?: number;
    turnoverAdequate?: boolean;
    dataTimestamp?: number;
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  };
  // Strategy track record
  performance?: {
    winRatePct?: number; // e.g. 68%
    profitFactor?: number; // e.g. 1.85
    sampleSignalsCount?: number;
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  };
  /** Trading-session context; when supplied a closed session fails the hard risk gates. */
  session?: {
    isMarketOpen: boolean;
    canGenerateFreshCandidates: boolean;
    phase: string;
  };
  // Custom weights override
  customWeights?: Partial<ScoringWeights>;
}

export interface TradeScoringResult {
  overallScore: number; // 0 - 100
  marketBias: MarketBias;
  confidenceLevel: number; // 0 - 100% calibrated
  dataQuality: DataFreshnessStatus;
  explanation: string;
  supportingBullishFactors: string[];
  supportingBearishFactors: string[];
  marketRisks: string[];
  factorBreakdown: FactorBreakdown[];
  /** Per-factor provenance: which inputs were real, unavailable, simulated or stale. */
  factorDataQuality: Array<{ id: string; name: string; state: FactorDataState }>;
  /** Share (0-1) of total model weight that had real data behind it. */
  dataCoverage: number;
  /** Ceiling applied to the overall score because of missing data (null when none applied). */
  scoreCap: number | null;
  riskChecks: HardRiskCheck[];
  allHardRiskPassed: boolean;
  scoringVersion: string;
  evaluationTimestamp: string;
}

const FRESHNESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes threshold

/** Factors whose absence makes execution unsafe (enforced by the data-integrity gate). */
const EXECUTION_CRITICAL_FACTORS = ["tech", "greeks", "iv", "oi", "liquidity"] as const;

/** Maximum overall score for a given real-data coverage (0..1). */
export function scoreCapForCoverage(coverage: number): number {
  return Math.round(45 + 55 * Math.max(0, Math.min(1, coverage)));
}

/**
 * Validate and compute the explainable trade score
 */
export function calculateTradeScore(input: TradeScoringInput): TradeScoringResult {
  const weights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...(input.customWeights ?? {}),
  };

  const nowMs = Date.now();
  const factorBreakdowns: FactorBreakdown[] = [];
  const factorDataQuality: TradeScoringResult["factorDataQuality"] = [];
  const bullishFactors: string[] = [];
  const bearishFactors: string[] = [];
  const marketRisks: string[] = [];
  const riskChecks: HardRiskCheck[] = [];

  let unavailableFactorsCount = 0;
  let staleFactorsCount = 0;

  const isGlobal =
    ["S&P 500", "NASDAQ 100", "DOW JONES", "SP500", "NASDAQ100", "DOWJONES"].includes(
      (input.instrument || "").toUpperCase().replace(/\s+/g, ""),
    ) ||
    (input.instrument || "").toUpperCase().includes("S&P") ||
    (input.instrument || "").toUpperCase().includes("NASDAQ") ||
    (input.instrument || "").toUpperCase().includes("DOW");
  const curSym = isGlobal ? "$" : "₹";

  const isStale = (ts: number | undefined, flagged?: boolean) =>
    flagged === true ||
    (ts !== undefined && Number.isFinite(ts) && nowMs - ts > FRESHNESS_MAX_AGE_MS);

  const pushFactor = (f: {
    id: string;
    name: string;
    weight: number;
    score: number;
    status: FactorBreakdown["status"];
    available: boolean;
    evidence: string;
    rationale: string;
    simulated?: boolean;
    /** True when the provider reports this data as stale/cached. */
    stale?: boolean;
  }) => {
    const score = f.available ? f.score : 0;
    factorBreakdowns.push({
      id: f.id,
      name: f.name,
      weight: f.weight,
      score,
      weightedContribution: f.available ? +(score * f.weight).toFixed(2) : 0,
      status: f.status,
      available: f.available,
      evidence: f.evidence,
      rationale: f.rationale,
    });
    const state: FactorDataState = f.simulated
      ? "SIMULATED"
      : !f.available
        ? "UNAVAILABLE"
        : f.status === "STALE"
          ? "STALE"
          : "REAL";
    factorDataQuality.push({ id: f.id, name: f.name, state });
    if (!f.available) unavailableFactorsCount++;
    if (f.available && f.status === "STALE") staleFactorsCount++;
  };

  // 1. Technical Analysis Factor (20%)
  const tech = input.technical;
  if (
    tech &&
    !tech.simulated &&
    tech.rsi !== undefined &&
    tech.ema9 !== undefined &&
    tech.ema21 !== undefined
  ) {
    const techStatus: FactorBreakdown["status"] = isStale(tech.dataTimestamp, tech.stale)
      ? "STALE"
      : "OPTIMAL";

    const emaTrendBullish = tech.ema9 > tech.ema21;
    const vwapKnown = tech.vwap !== undefined;
    const vwapBullish = vwapKnown ? input.spotPrice > (tech.vwap as number) : undefined;
    const rsiBullish = tech.rsi >= 50 && tech.rsi <= 70;
    const rsiOversold = tech.rsi < 30;
    const rsiOverbought = tech.rsi > 70;

    let points = 50;
    if (input.intendedDirection === "CALL") {
      points += emaTrendBullish ? 20 : -20;
      if (vwapBullish !== undefined) points += vwapBullish ? 15 : -15;
      if (tech.supertrendBullish !== undefined) points += tech.supertrendBullish ? 10 : -10;
      if (rsiBullish) points += 15;
      else if (rsiOversold)
        points += 5; // mean reversion potential
      else if (rsiOverbought) points -= 20; // overextended
    } else if (input.intendedDirection === "PUT") {
      points += !emaTrendBullish ? 20 : -20;
      if (vwapBullish !== undefined) points += !vwapBullish ? 15 : -15;
      if (tech.supertrendBullish !== undefined) points += !tech.supertrendBullish ? 10 : -10;
      if (tech.rsi < 50 && tech.rsi >= 30) points += 15;
      else if (rsiOverbought) points += 10;
      else if (rsiOversold) points -= 20;
    } else {
      points = 50;
    }

    const techScore = Math.max(10, Math.min(95, points));
    const vwapText = vwapKnown ? `${curSym}${(tech.vwap as number).toFixed(1)}` : "n/a";
    pushFactor({
      id: "tech",
      name: "Technical Momentum & Trend Structure",
      weight: weights.technicalAnalysis,
      score: techScore,
      status: techStatus,
      available: true,
      evidence: `RSI(14): ${tech.rsi.toFixed(1)}, 9EMA: ${curSym}${tech.ema9.toFixed(1)}, 21EMA: ${curSym}${tech.ema21.toFixed(1)}, VWAP: ${vwapText}`,
      rationale: `${emaTrendBullish ? "Bullish EMA crossover" : "Bearish EMA alignment"}${
        vwapBullish === undefined
          ? " (VWAP unavailable for this feed)."
          : ` with spot ${vwapBullish ? "above" : "below"} intraday VWAP.`
      }`,
    });

    if (techScore >= 65) {
      bullishFactors.push(
        `Strong technical momentum: 9EMA > 21EMA with RSI at ${tech.rsi.toFixed(1)}`,
      );
    } else if (techScore <= 40) {
      bearishFactors.push(`Weak technical posture: adverse EMA/VWAP alignment`);
    }
  } else {
    pushFactor({
      id: "tech",
      name: "Technical Momentum & Trend Structure",
      weight: weights.technicalAnalysis,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: tech?.simulated,
      evidence: tech?.simulated
        ? "Technical inputs are simulated"
        : "No real technical indicators supplied",
      rationale: "Factor excluded from the score; no placeholder value substituted",
    });
  }

  // 2. Options Greeks & Strategy Suitability (20%) and 3. IV (15%)
  const greeks = input.greeks;
  const greeksUsable = greeks !== undefined && !greeks.simulated;
  if (greeksUsable && greeks.delta !== undefined && greeks.thetaPerDay !== undefined) {
    const greeksStatus: FactorBreakdown["status"] = isStale(greeks.dataTimestamp, greeks.stale)
      ? "STALE"
      : "OPTIMAL";

    let gPoints = 50;
    const absDelta = Math.abs(greeks.delta);
    // For buying index options, delta between 0.40 and 0.65 provides optimal leverage with balanced decay
    if (absDelta >= 0.35 && absDelta <= 0.65) {
      gPoints += 25;
      bullishFactors.push(
        `Contract delta (${absDelta.toFixed(2)}) is in optimal sweet spot for directional capture without excessive extrinsic drag.`,
      );
    } else if (absDelta < 0.2) {
      gPoints -= 25;
      marketRisks.push(
        `Deep OTM option (delta ${absDelta.toFixed(2)}) suffers severe probability degradation and rapid theta bleed.`,
      );
    }

    // Expiry day theta risk (only when DTE is actually known)
    const dte = greeks.daysToExpiry;
    if (dte !== undefined) {
      if (dte <= 0.2) {
        gPoints -= 20;
        marketRisks.push(
          `Expiry day gamma risk: ${(dte * 24).toFixed(1)} hours left; rapid non-linear premium decay.`,
        );
      } else if (dte >= 2) {
        gPoints += 15;
      }
    }

    pushFactor({
      id: "greeks",
      name: "Options Greeks & Strategy Suitability",
      weight: weights.optionsGreeks,
      score: Math.max(10, Math.min(95, gPoints)),
      status: greeksStatus,
      available: true,
      evidence: `Delta: ${greeks.delta.toFixed(3)}, Gamma: ${(greeks.gamma ?? 0).toFixed(4)}, Theta: ${curSym}${greeks.thetaPerDay.toFixed(1)}/day, DTE: ${dte !== undefined ? dte.toFixed(1) : "n/a"} days`,
      rationale: `Directional responsiveness assessed. Theta decay rate ${curSym}${Math.abs(greeks.thetaPerDay).toFixed(1)}/day.`,
    });
  } else {
    pushFactor({
      id: "greeks",
      name: "Options Greeks & Strategy Suitability",
      weight: weights.optionsGreeks,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: greeks?.simulated,
      evidence: greeks?.simulated
        ? "Greeks are simulated (not a live feed)"
        : "Greeks data not provided",
      rationale: "Cannot assess delta directional sensitivity or theta decay; factor excluded",
    });
  }

  if (greeksUsable && greeks.iv !== undefined) {
    const ivStatus: FactorBreakdown["status"] = isStale(greeks.dataTimestamp, greeks.stale)
      ? "STALE"
      : "OPTIMAL";
    const ivPct = greeks.iv * 100;
    // For Indian index options, 11% - 17% is moderate; > 22% is elevated
    let ivPts = 50;
    let ivEvidence: string;
    let ivRationale: string;
    if (ivPct >= 11 && ivPct <= 18) {
      ivPts += 30; // Fair pricing for option buying
      ivEvidence = `ATM Implied Volatility: ${ivPct.toFixed(1)}% (Normal volatility environment)`;
      ivRationale = `Option premiums are reasonably priced without high volatility crush risk.`;
    } else if (ivPct > 24) {
      ivPts -= 25;
      ivEvidence = `ATM Implied Volatility: ${ivPct.toFixed(1)}% (Elevated IV)`;
      ivRationale = `High IV increases cost of premium and exposes buyers to post-event IV crush.`;
      marketRisks.push(
        `Elevated IV (${ivPct.toFixed(1)}%): high risk of implied volatility deflation even if direction is correct.`,
      );
    } else {
      ivPts += 10;
      ivEvidence = `ATM Implied Volatility: ${ivPct.toFixed(1)}% (Low IV)`;
      ivRationale = `Cheap premium pricing, though low volatility may restrict fast target expansion.`;
    }
    pushFactor({
      id: "iv",
      name: "Implied Volatility & Pricing Regime",
      weight: weights.impliedVolatility,
      score: Math.max(15, Math.min(90, ivPts)),
      status: ivStatus,
      available: true,
      evidence: ivEvidence,
      rationale: ivRationale,
    });
  } else {
    pushFactor({
      id: "iv",
      name: "Implied Volatility & Pricing Regime",
      weight: weights.impliedVolatility,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: greeks?.simulated,
      evidence: greeks?.simulated ? "IV is simulated (not a live feed)" : "IV metrics unavailable",
      rationale: "Volatility regime undetermined; factor excluded",
    });
  }

  // 4. Open Interest & Strike Positioning (10%)
  const oi = input.openInterest;
  if (oi && !oi.simulated && oi.pcr !== undefined) {
    const oiStatus: FactorBreakdown["status"] = isStale(oi.dataTimestamp, oi.stale)
      ? "STALE"
      : "OPTIMAL";
    const pcr = oi.pcr;
    let oiPts = 50;

    // PCR interpretation:
    // > 1.3 is heavy put writing (bullish support), < 0.75 is heavy call writing (bearish resistance).
    // Note: PCR alone is not directional prediction, but reflects structural positioning.
    if (input.intendedDirection === "CALL") {
      if (pcr >= 1.15 && pcr <= 1.6) {
        oiPts += 30;
        bullishFactors.push(
          `PCR at ${pcr.toFixed(2)} signifies strong put-writing support at lower strikes.`,
        );
      } else if (pcr < 0.75) {
        oiPts -= 25;
        bearishFactors.push(
          `Low PCR (${pcr.toFixed(2)}) indicates prevailing call writer overhead resistance.`,
        );
      }
    } else if (input.intendedDirection === "PUT") {
      if (pcr <= 0.8) {
        oiPts += 30;
        bearishFactors.push(
          `PCR at ${pcr.toFixed(2)} confirms call writing dominance above current spot.`,
        );
      } else if (pcr > 1.4) {
        oiPts -= 25;
        marketRisks.push(
          `High PCR (${pcr.toFixed(2)}) indicates solid put base; breakdown requires aggressive institutional selling.`,
        );
      }
    }

    pushFactor({
      id: "oi",
      name: "Open Interest & Positioning Dynamics",
      weight: weights.openInterest,
      score: Math.max(15, Math.min(90, oiPts)),
      status: oiStatus,
      available: true,
      evidence: `Put-Call Ratio (PCR): ${pcr.toFixed(2)}${oi.maxPainStrike ? `, Max Pain: ${curSym}${oi.maxPainStrike}` : ""}`,
      rationale: `Positioning reflects ${pcr > 1.0 ? "put writing support base" : "call writing overhead pressure"}.`,
    });
  } else {
    pushFactor({
      id: "oi",
      name: "Open Interest & Positioning Dynamics",
      weight: weights.openInterest,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: oi?.simulated,
      evidence: oi?.simulated
        ? "OI distribution is simulated (no live exchange feed)"
        : "OI distribution unavailable",
      rationale: "Positioning undetermined; factor excluded",
    });
  }

  // 5. Verified News & Macroeconomic Context (15%)
  const macro = input.macroSentiment;
  if (macro && !macro.simulated && macro.sentimentScore !== undefined) {
    const sent = macro.sentimentScore; // -1 to +1
    let mPts = 50;

    if (input.intendedDirection === "CALL") {
      mPts += sent * 35;
    } else if (input.intendedDirection === "PUT") {
      mPts -= sent * 35;
    }

    const headlines =
      macro.verifiedHeadlinesCount !== undefined
        ? ` across ${macro.verifiedHeadlinesCount} verified sources`
        : "";
    if (sent > 0.25) {
      bullishFactors.push(
        `Macro catalysts net positive (sentiment score +${(sent * 100).toFixed(0)}/100${headlines}).`,
      );
    } else if (sent < -0.25) {
      bearishFactors.push(
        `Macro headwinds active (sentiment score ${(sent * 100).toFixed(0)}/100${headlines}).`,
      );
    }

    if ((macro.highImpactEventsCount ?? 0) > 0) {
      marketRisks.push(
        `Scheduled high-impact macroeconomic/policy event within current trading session.`,
      );
    }

    pushFactor({
      id: "macro",
      name: "Geopolitical, Monetary & Macroeconomic Context",
      weight: weights.macroNews,
      score: Math.max(15, Math.min(90, Math.round(mPts))),
      status: "OPTIMAL",
      available: true,
      evidence: `Sentiment Score: ${sent > 0 ? "+" : ""}${(sent * 100).toFixed(0)}/100${
        macro.verifiedHeadlinesCount !== undefined
          ? `, Verified Headlines: ${macro.verifiedHeadlinesCount}`
          : ""
      }${
        macro.highImpactEventsCount !== undefined
          ? `, High-Impact: ${macro.highImpactEventsCount}`
          : ""
      }`,
      rationale: `Macro alignment evaluated against institutional monetary, crude, and geopolitical developments.`,
    });
  } else {
    pushFactor({
      id: "macro",
      name: "Geopolitical, Monetary & Macroeconomic Context",
      weight: weights.macroNews,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: macro?.simulated,
      evidence: "No verified macro sentiment score available",
      rationale: "Factor excluded; no baseline sentiment assumed",
    });
  }

  // 6. Liquidity & Transaction Costs (10%)
  const liq = input.liquidity;
  if (liq && !liq.simulated && liq.bidAskSpreadPct !== undefined) {
    let lPts = 70;
    const spread = liq.bidAskSpreadPct;
    let liqEvidence: string;

    if (spread <= 0.5) {
      lPts += 25;
      liqEvidence = `Tight bid-ask spread (${spread.toFixed(2)}%), slippage minimal`;
    } else if (spread > 2.0) {
      lPts -= 40;
      liqEvidence = `Wide bid-ask spread (${spread.toFixed(2)}%), friction risk elevated`;
      marketRisks.push(
        `Liquidity friction: bid-ask spread is ${spread.toFixed(2)}%, raising round-trip execution slippage.`,
      );
    } else {
      liqEvidence = `Acceptable bid-ask spread (${spread.toFixed(2)}%)`;
    }

    pushFactor({
      id: "liquidity",
      name: "Execution Liquidity & Slippage Costs",
      weight: weights.liquidityCost,
      score: Math.max(20, Math.min(95, lPts)),
      status: isStale(liq.dataTimestamp, liq.stale) ? "STALE" : "OPTIMAL",
      available: true,
      evidence: liqEvidence,
      rationale: `Evaluates market maker depth and round-trip slippage for chosen strike.`,
    });
  } else {
    pushFactor({
      id: "liquidity",
      name: "Execution Liquidity & Slippage Costs",
      weight: weights.liquidityCost,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: liq?.simulated,
      evidence: liq?.simulated
        ? "Bid/ask is simulated (no live order book)"
        : "No real bid/ask spread available",
      rationale: "Execution cost unknown; no typical spread is assumed",
    });
  }

  // 7. Validated Strategy Performance (10%)
  const perf = input.performance;
  if (perf && !perf.simulated && perf.winRatePct !== undefined && perf.profitFactor !== undefined) {
    let pPts = 50;
    if (perf.winRatePct >= 65 && perf.profitFactor >= 1.6) {
      pPts += 35;
      bullishFactors.push(
        `Strategy historical win rate ${perf.winRatePct}% with profit factor ${perf.profitFactor}${
          perf.sampleSignalsCount !== undefined ? ` over ${perf.sampleSignalsCount} signals` : ""
        }.`,
      );
    } else if (perf.winRatePct < 45 || perf.profitFactor < 1.1) {
      pPts -= 25;
      marketRisks.push(`Strategy out-of-sample edge is below threshold (PF ${perf.profitFactor}).`);
    }

    pushFactor({
      id: "performance",
      name: "Strategy Empirical Track Record",
      weight: weights.strategyPerformance,
      score: Math.max(20, Math.min(95, pPts)),
      status: "OPTIMAL",
      available: true,
      evidence: `Historical Win Rate: ${perf.winRatePct}%, Profit Factor: ${perf.profitFactor}`,
      rationale: `Quantified empirical edge from past market cycles.`,
    });
  } else {
    pushFactor({
      id: "performance",
      name: "Strategy Empirical Track Record",
      weight: weights.strategyPerformance,
      score: 0,
      status: "MISSING_DATA",
      available: false,
      simulated: perf?.simulated,
      evidence: perf?.simulated
        ? "Performance statistics are illustrative, not from a real backtest"
        : "No validated strategy performance statistics available",
      rationale: "Factor excluded; no baseline win rate assumed",
    });
  }

  // Combine scores over the AVAILABLE weight only, then cap by data coverage.
  const totalWeight = factorBreakdowns.reduce((a, f) => a + f.weight, 0) || 1;
  const availableWeight = factorBreakdowns.reduce((a, f) => a + (f.available ? f.weight : 0), 0);
  const dataCoverage = +(availableWeight / totalWeight).toFixed(3);
  const rawOverall =
    availableWeight > 0
      ? factorBreakdowns.reduce((a, f) => a + f.weightedContribution, 0) / availableWeight
      : 0;
  const cap = scoreCapForCoverage(dataCoverage);
  const scoreCap = dataCoverage < 1 ? cap : null;
  let overallScore = availableWeight > 0 ? Math.round(Math.max(10, Math.min(98, rawOverall))) : 0;
  if (scoreCap !== null) overallScore = Math.min(overallScore, scoreCap);

  // Calibrate Market Bias (insufficient evidence => NEUTRAL)
  let marketBias: MarketBias = "NEUTRAL";
  if (dataCoverage >= 0.5) {
    if (overallScore >= 62) {
      marketBias = input.intendedDirection === "PUT" ? "BEARISH" : "BULLISH";
    } else if (overallScore <= 44) {
      marketBias = input.intendedDirection === "PUT" ? "BULLISH" : "BEARISH";
    }
  }

  // Calibrate Confidence Level (0-100%): penalize unavailable, simulated and stale inputs
  let confidence = 85;
  confidence -= unavailableFactorsCount * 12;
  confidence -= staleFactorsCount * 15;
  if (overallScore >= 45 && overallScore <= 55) {
    confidence -= 15; // Ambiguous signal zone
  }
  confidence = Math.max(20, Math.min(95, confidence));

  // Determine Data Freshness Status
  let dataQuality: DataFreshnessStatus = "LIVE_VERIFIED";
  if (unavailableFactorsCount >= 3) {
    dataQuality = "INSUFFICIENT_DATA";
  } else if (staleFactorsCount > 0) {
    dataQuality = "STALE";
  } else if (unavailableFactorsCount > 0) {
    dataQuality = "PARTIAL_INPUTS";
  }

  // HARD RISK CHECKS (Must NOT be overridden by a high score)
  // Check 0: Data integrity — execution-critical inputs must be real and fresh
  const criticalProblems = factorBreakdowns
    .filter(
      (f) =>
        (EXECUTION_CRITICAL_FACTORS as readonly string[]).includes(f.id) &&
        (!f.available || f.status === "STALE"),
    )
    .map((f) => `${f.name} (${f.available ? "stale" : "unavailable"})`);
  const dataIntegrityOk = criticalProblems.length === 0;
  riskChecks.push({
    id: "risk_data_integrity",
    name: "Real & Fresh Execution Inputs",
    passed: dataIntegrityOk,
    severity: dataIntegrityOk ? "INFO" : "CRITICAL",
    rule: "Technicals, Greeks, IV, OI and liquidity must be real, non-simulated and fresh",
    observedValue: dataIntegrityOk
      ? "All execution-critical inputs real and fresh"
      : `Missing/stale: ${criticalProblems.join("; ")}`,
    mitigation: dataIntegrityOk
      ? "No action required"
      : "Do not trade until live broker data and real candles are available",
  });

  // Check 0b: Market session (only evaluated when the caller supplies session context)
  if (input.session) {
    const sessionOk = input.session.isMarketOpen && input.session.canGenerateFreshCandidates;
    riskChecks.push({
      id: "risk_session",
      name: "Market Session Open",
      passed: sessionOk,
      severity: sessionOk ? "INFO" : "CRITICAL",
      rule: "Fresh trade setups are only valid while the exchange session is open",
      observedValue: `Session phase: ${input.session.phase}`,
      mitigation: sessionOk ? "Session is live" : "Wait for the next regular session",
    });
  }

  // Check 1: Expiry Day Gamma Risk (unknown DTE cannot be assumed safe)
  const dteKnown = input.greeks?.daysToExpiry;
  const isExpiryDay = dteKnown !== undefined && dteKnown <= 0.15;
  const gammaPassed = dteKnown !== undefined && !isExpiryDay;
  riskChecks.push({
    id: "risk_gamma",
    name: "Expiry Day Rapid Decay & Gamma Spike",
    passed: gammaPassed,
    severity: isExpiryDay ? "CRITICAL" : gammaPassed ? "INFO" : "HIGH",
    rule: "Avoid naked buyer positions within 90 minutes of weekly expiry",
    observedValue:
      dteKnown === undefined
        ? "Days to expiry unavailable"
        : `${(dteKnown * 24).toFixed(1)} hours remaining to expiry`,
    mitigation: isExpiryDay
      ? "Use defined spreads or roll to next weekly expiry"
      : gammaPassed
        ? "DTE is adequate for swing retention"
        : "Cannot verify expiry proximity; wait for contract data",
  });

  // Check 2: Liquidity & Slippage Gate (unknown spread cannot be assumed acceptable)
  const spreadKnown = input.liquidity?.bidAskSpreadPct;
  const liquidityReal = input.liquidity !== undefined && !input.liquidity.simulated;
  const spreadObserved = liquidityReal ? spreadKnown : undefined;
  const isSpreadAcceptable = spreadObserved !== undefined && spreadObserved <= 2.5;
  riskChecks.push({
    id: "risk_spread",
    name: "Bid-Ask Slippage Tolerance",
    passed: isSpreadAcceptable,
    severity: isSpreadAcceptable ? "INFO" : "HIGH",
    rule: "Bid-ask spread must be <= 2.5% of premium to avoid catastrophic entry friction",
    observedValue:
      spreadObserved === undefined
        ? "Real bid-ask spread unavailable"
        : `${spreadObserved.toFixed(2)}% spread observed`,
    mitigation: isSpreadAcceptable
      ? "Slippage within acceptable bounds"
      : spreadObserved === undefined
        ? "Wait for a real two-sided quote"
        : "Switch to liquid ATM strike or use limit orders only",
  });

  // Check 3: Volatility Event Risk Gate
  const macroReal = input.macroSentiment !== undefined && !input.macroSentiment.simulated;
  const highImpactCount = macroReal
    ? (input.macroSentiment?.highImpactEventsCount ?? 0)
    : undefined;
  const ivKnown = greeksUsable ? input.greeks?.iv : undefined;
  const ivElevated = ivKnown !== undefined && ivKnown > 0.28;
  let eventPassed: boolean;
  let eventObserved: string;
  if (ivKnown === undefined) {
    eventPassed = false;
    eventObserved = "IV unavailable; event/crush risk cannot be assessed";
  } else if (highImpactCount === undefined) {
    // No event feed: only safe to pass when IV is not elevated (crush risk bounded).
    eventPassed = !ivElevated;
    eventObserved = `Event feed unavailable; IV ${(ivKnown * 100).toFixed(1)}%`;
  } else {
    eventPassed = !(highImpactCount > 0 && ivElevated);
    eventObserved = `${highImpactCount} high-impact events; IV ${(ivKnown * 100).toFixed(1)}%`;
  }
  riskChecks.push({
    id: "risk_event",
    name: "Macro Event Volatility Crush Risk",
    passed: eventPassed,
    severity: eventPassed ? "INFO" : "HIGH",
    rule: "Flag high IV (>28%) before scheduled high-impact monetary policy / fiscal budget",
    observedValue: eventObserved,
    mitigation: eventPassed
      ? "No pending high-volatility event clash detected"
      : "Consider hedging with credit spreads to benefit from IV contraction, or wait for data",
  });

  const allHardRiskPassed = riskChecks.every((r) => r.passed || r.severity === "INFO");

  // Construct Concise Explanation
  let explanation = `Score: ${overallScore}/100. `;
  if (dataCoverage === 0) {
    explanation += `No real inputs available; no assessment can be made.`;
  } else if (overallScore >= 70) {
    explanation += `Strong ${marketBias.toLowerCase()} confluence across the available real inputs.`;
  } else if (overallScore >= 55) {
    explanation += `Moderate ${marketBias.toLowerCase()} bias; volatility conditions require tighter stop management.`;
  } else if (overallScore >= 45) {
    explanation += `Market bias is neutral; available inputs are conflicting or inconclusive.`;
  } else {
    explanation += `Adverse confluence for ${input.intendedDirection} position among the available inputs.`;
  }
  if (scoreCap !== null) {
    explanation += ` Score capped at ${scoreCap} because only ${Math.round(dataCoverage * 100)}% of the model has real data.`;
  }
  if (unavailableFactorsCount > 0) {
    const names = factorBreakdowns.filter((f) => !f.available).map((f) => f.id);
    explanation += ` Unavailable: ${names.join(", ")}.`;
  }
  if (marketRisks.length > 0) {
    explanation += ` Caution: ${marketRisks[0]}`;
  }

  // Explicit (non-fabricated) placeholders when nothing was identified
  if (bullishFactors.length === 0) {
    bullishFactors.push("No bullish confirmations identified in the available data.");
  }
  if (bearishFactors.length === 0) {
    bearishFactors.push("No bearish confirmations identified in the available data.");
  }
  if (marketRisks.length === 0) {
    marketRisks.push("No specific market risks flagged by the available data.");
  }

  return {
    overallScore,
    marketBias,
    confidenceLevel: confidence,
    dataQuality,
    explanation,
    supportingBullishFactors: bullishFactors,
    supportingBearishFactors: bearishFactors,
    marketRisks,
    factorBreakdown: factorBreakdowns,
    factorDataQuality,
    dataCoverage,
    scoreCap,
    riskChecks,
    allHardRiskPassed,
    scoringVersion: "v3.0-7Factor-DataIntegrity",
    evaluationTimestamp: new Date().toISOString(),
  };
}
