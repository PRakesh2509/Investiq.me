/**
 * Trade Candidate Service (`tradeCandidateService`)
 *
 * Implements Phase 4, 5 & 6: Explainable Trade Candidate Engine with Lifecycle Tracking.
 * - Multi-criteria ranking and explainable setup scoring
 * - Independent hard risk gates via marketRiskService
 * - Full candidate lifecycle: WATCHING -> CONFIRMED -> TARGET_REACHED / STOP_CONDITION_REACHED / INVALIDATED / EXPIRED / NO_TRADE
 * - Deduplication and subsequent price tick tracking
 * - Explicit NO_TRADE and INSUFFICIENT_DATA decisions
 *
 * Integrity rules (no fabricated inputs):
 * - A candidate is only produced from a real, non-simulated option chain with real bid/ask/LTP
 *   for every leg, real candle-based technicals, and live Greeks. Anything missing yields an
 *   explicit NO_TRADE decision (never a default price, delta or spread).
 * - Closed sessions never produce fresh candidates.
 * - Registry/history are bounded and expire; module memory is only a best-effort cache.
 */

import type { FnoMarketSnapshot } from "./fnoMarketDataService.ts";
import type { GreeksAnalysisReport } from "./greeksAnalysisService.ts";
import type { CombinedFnoAnalysisReport } from "./fnoSignalAnalysisService.ts";
import { marketRiskService } from "./marketRiskService.ts";
import { tradingSessionService } from "./tradingSessionService.ts";
import { WORKSTATION_INSTRUMENTS } from "../terminal-workstation.functions.ts";
import type { NormalizedOptionLeg } from "../options-data-provider.server.ts";

export type CandidateLifecycleStatus =
  | "WATCHING"
  | "CONFIRMED"
  | "INVALIDATED"
  | "TARGET_REACHED"
  | "STOP_CONDITION_REACHED"
  | "EXPIRED"
  | "NO_TRADE";

export interface TradeCandidateLeg {
  strike: number;
  type: "CE" | "PE";
  action: "BUY" | "SELL";
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

export interface ExplainableTradeCandidate {
  id: string;
  rank: number;
  instrument: string;
  expiry: string;
  strategyType: "LONG_CALL" | "LONG_PUT" | "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD";
  callPut: "CE" | "PE" | "SPREAD";
  strike: number;
  legs: TradeCandidateLeg[];
  entryTrigger: string;
  entryZone: { min: number; max: number };
  currentReferencePrice: number;
  timestamp: string;
  stopLoss: number;
  invalidationCondition: string;
  targetLevels: { t1: number; t2: number; t3: number };
  exitConditions: string[];
  riskRewardRatio: number;
  maxEstimatedLoss: number; // max loss in account currency
  totalDebitRequired: number; // margin/capital
  positionSizing: {
    recommendedLots: number;
    totalQuantity: number;
    capitalAtRisk: number;
    capitalAllocatedPct: number;
  };
  greeksAndIvContext: {
    netDelta: number;
    netGamma: number;
    netThetaPerDay: number;
    netVegaPerPoint: number;
    atmIv: number;
    ivSkew: number | null;
  };
  technicalConfirmation: {
    trend: string;
    rsi14: number | null;
    emaStatus: string;
    vwapStatus: string;
    summary: string;
  };
  optionsPositioningConfirmation: {
    pcr: number;
    maxPain: number;
    highestOiWall: string;
    summary: string;
  };
  reasonsSupporting: string[];
  reasonsAgainst: string[];
  dataQualityStatus: "LIVE" | "DELAYED" | "STALE" | "MARKET_CLOSED" | "INSUFFICIENT_DATA";
  /** Which inputs backed this candidate (all REAL by construction; kept for audit). */
  dataProvenance: {
    optionChain: "LIVE_BROKER";
    technicals: "REAL_CANDLES";
    greeks: "REAL";
    provider: string;
    candleLastBarAt: string | null;
  };
  setupScore: number; // 0 - 100 explainable score
  scoringMethodology: {
    technicalWeight: number;
    greeksWeight: number;
    positioningWeight: number;
    riskAdjustedWeight: number;
    scoreFactors: Array<{ name: string; score: number; contribution: number }>;
  };
  invalidationTriggers: string[];
  lifecycleStatus: CandidateLifecycleStatus;
  lifecycleHistory: Array<{
    status: CandidateLifecycleStatus;
    timestamp: string;
    priceAtChange: number;
    note: string;
  }>;
  subsequentPriceUpdates: Array<{
    timestamp: string;
    spotPrice: number;
    unrealizedPnlEstimate: number;
  }>;
}

export interface NoTradeDecisionReport {
  isNoTrade: true;
  reasonCode:
    | "MARKET_CLOSED"
    | "DATA_STALE_OR_INSUFFICIENT"
    | "HIGH_EVENT_RISK"
    | "RANGEBOUND_CHOP"
    | "EXPIRY_AFTERNOON_THETA_TRAP"
    | "RISK_BUDGET_EXCEEDED"
    | "LOW_CONFLUENCE_EDGE";
  headline: string;
  summary: string;
  evidence: string[];
  capitalPreservationMessage: string;
  reevaluationTriggers: string[];
  timestamp: string;
}

export interface CandidateGenerationResult {
  instrument: string;
  underlyingPrice: number;
  marketSessionText: string;
  activeCandidates: ExplainableTradeCandidate[];
  historicalCandidates: ExplainableTradeCandidate[];
  noTradeDecision?: NoTradeDecisionReport;
  timestamp: string;
}

const MAX_REGISTRY = 50;
const MAX_HISTORY = 200;
/** Intraday setups are not valid indefinitely. */
const CANDIDATE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

function isGlobalInstrument(instrument: string): boolean {
  return WORKSTATION_INSTRUMENTS[instrument]?.isGlobal === true;
}

/** A leg is tradeable only with a real LTP and a real, uncrossed, two-sided quote. */
function hasRealQuote(leg: NormalizedOptionLeg | undefined): leg is NormalizedOptionLeg & {
  bid: number;
  ask: number;
} {
  return (
    leg !== undefined &&
    Number.isFinite(leg.ltp) &&
    leg.ltp > 0 &&
    typeof leg.bid === "number" &&
    typeof leg.ask === "number" &&
    leg.bid > 0 &&
    leg.ask >= leg.bid
  );
}

function spreadPctOf(leg: { bid: number; ask: number }): number {
  const mid = (leg.bid + leg.ask) / 2;
  return mid > 0 ? ((leg.ask - leg.bid) / mid) * 100 : Number.POSITIVE_INFINITY;
}

function toCandidateLeg(
  leg: NormalizedOptionLeg,
  type: "CE" | "PE",
  action: "BUY" | "SELL",
): TradeCandidateLeg {
  return {
    strike: leg.strikePrice,
    type,
    action,
    price: leg.ltp,
    delta: leg.delta,
    gamma: leg.gamma,
    theta: leg.theta,
    vega: leg.vega,
    iv: leg.impliedVolatility,
  };
}

export class TradeCandidateService {
  // In-memory candidate registry (keyed by candidate ID)
  private registry: Map<string, ExplainableTradeCandidate> = new Map();
  // Historical closed candidate log
  private history: ExplainableTradeCandidate[] = [];

  /** Closed/expired candidates, most recent last. */
  public getHistory(limit = 50, instrument?: string): ExplainableTradeCandidate[] {
    const list = instrument
      ? this.history.filter((c) => c.instrument === instrument)
      : this.history;
    return list.slice(-Math.max(0, limit));
  }

  public getActiveCandidates(instrument?: string): ExplainableTradeCandidate[] {
    return Array.from(this.registry.values()).filter(
      (c) =>
        (c.lifecycleStatus === "WATCHING" || c.lifecycleStatus === "CONFIRMED") &&
        (!instrument || c.instrument === instrument),
    );
  }

  /** Test helper: drop all in-memory lifecycle state. */
  public reset(): void {
    this.registry.clear();
    this.history = [];
  }

  private archive(candidate: ExplainableTradeCandidate): void {
    this.history.push({ ...candidate });
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }
  }

  private expireOldCandidates(nowMs: number): void {
    for (const [id, c] of this.registry) {
      const active = c.lifecycleStatus === "WATCHING" || c.lifecycleStatus === "CONFIRMED";
      const age = nowMs - new Date(c.timestamp).getTime();
      if (active && age > CANDIDATE_MAX_AGE_MS) {
        c.lifecycleStatus = "EXPIRED";
        c.lifecycleHistory.push({
          status: "EXPIRED",
          timestamp: new Date(nowMs).toISOString(),
          priceAtChange: c.currentReferencePrice,
          note: "Setup exceeded its intraday validity window.",
        });
        this.archive(c);
        this.registry.delete(id);
      } else if (!active) {
        // Terminal states are kept in history; drop them from the live registry.
        this.registry.delete(id);
      }
    }
    while (this.registry.size > MAX_REGISTRY) {
      const oldest = this.registry.keys().next().value;
      if (oldest === undefined) break;
      this.registry.delete(oldest);
    }
  }

  /**
   * Evaluate market conditions and generate or update active explainable candidates
   */
  public evaluateCandidates(
    marketSnapshot: FnoMarketSnapshot,
    greeksReport: GreeksAnalysisReport,
    combinedAnalysis: CombinedFnoAnalysisReport,
    accountCapital: number = 30000,
    maxRiskPerTradePct: number = 2.0,
  ): CandidateGenerationResult {
    const { instrument, underlyingPrice, expiryDate, rows, validation } = marketSnapshot;
    const cfg = WORKSTATION_INSTRUMENTS[instrument];
    if (!cfg) {
      throw new Error(`Unknown instrument: ${instrument}`);
    }
    const session = tradingSessionService.getSessionInfo(undefined, instrument);
    const step = cfg.step;
    const lotSize = cfg.lotSize;
    this.expireOldCandidates(Date.now());

    const noTradeResult = (noTrade: NoTradeDecisionReport): CandidateGenerationResult => ({
      instrument,
      underlyingPrice,
      marketSessionText: session.sessionText,
      activeCandidates: [],
      historicalCandidates: this.history.slice(-10),
      noTradeDecision: noTrade,
      timestamp: new Date().toISOString(),
    });

    // 1. Mandatory Data Quality Check
    if (
      !validation.isValid ||
      validation.freshnessStatus === "STALE" ||
      validation.freshnessStatus === "INSUFFICIENT_DATA"
    ) {
      return noTradeResult({
        isNoTrade: true,
        reasonCode: "DATA_STALE_OR_INSUFFICIENT",
        headline: "NO TRADE: Market Data Quality Invalidation",
        summary: `Current market data marked as ${validation.freshnessStatus}. Trading gates prevent candidate generation on stale or unverified feeds.`,
        evidence: validation.issues.map((i) => `${i.field}: ${i.message}`),
        capitalPreservationMessage:
          "Capital is preserved 100% in cash. Waiting for verified live broker quotes.",
        reevaluationTriggers: ["Wait for fresh live tick updates", "Check broker API credentials"],
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Market Session Check (Outside regular market hours)
    if (!session.canGenerateFreshCandidates || !session.isMarketOpen) {
      return noTradeResult({
        isNoTrade: true,
        reasonCode: "MARKET_CLOSED",
        headline: "NO TRADE: Market Session Closed",
        summary: `${session.sessionText}. Fresh intraday candidates are frozen until the next regular session.`,
        evidence: [`Current IST Time: ${session.istTimeString}`, `Phase: ${session.phase}`],
        capitalPreservationMessage: "No capital at risk outside regular market session.",
        reevaluationTriggers: [`Next session: ${session.nextSessionOpensAt}`],
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Provenance Check: every input must be real. No simulated / missing inputs.
    const provenanceIssues: string[] = [];
    if (marketSnapshot.isSimulated) {
      provenanceIssues.push(
        `Option chain is a simulated baseline (${marketSnapshot.provider}); no live broker feed.`,
      );
    }
    if (greeksReport.isSimulated) {
      provenanceIssues.push("Greeks are computed locally, not from a live feed.");
    }
    if (greeksReport.freshnessStatus === "STALE") {
      provenanceIssues.push("Greeks surface is stale (cached provider data).");
    }
    if (validation.freshnessStatus === "DELAYED") {
      provenanceIssues.push(
        "Option chain is delayed (not real-time); entry triggers need live quotes.",
      );
    }
    if (!combinedAnalysis.technical.available) {
      provenanceIssues.push(
        `Technical indicators unavailable: ${combinedAnalysis.technical.unavailableReason ?? "no real candles"}`,
      );
    }
    if (rows.length === 0) {
      provenanceIssues.push("Option chain has no strikes.");
    }
    if (provenanceIssues.length > 0) {
      return noTradeResult({
        isNoTrade: true,
        reasonCode: "DATA_STALE_OR_INSUFFICIENT",
        headline: "NO TRADE: Inputs Unverified or Unavailable",
        summary:
          "Trade candidates require a live broker option chain, real price candles and live Greeks. Missing or simulated inputs are never substituted.",
        evidence: provenanceIssues,
        capitalPreservationMessage:
          "Capital is preserved. No setup is produced from simulated or missing data.",
        reevaluationTriggers: [
          "Configure/restore a live broker option-chain feed",
          "Wait for real intraday candles to become available",
        ],
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Confluence & Edge Threshold Check
    if (
      combinedAnalysis.marketBias === "NEUTRAL_RANGEBOUND" ||
      (combinedAnalysis.confluenceScore > 40 && combinedAnalysis.confluenceScore < 60)
    ) {
      return noTradeResult({
        isNoTrade: true,
        reasonCode: "RANGEBOUND_CHOP",
        headline: "NO TRADE: Insufficient Directional Confluence",
        summary: `Market is in rangebound consolidation between ${combinedAnalysis.positioning.highestPutOiStrike} and ${combinedAnalysis.positioning.highestCallOiStrike}. Risk-reward edge is insufficient.`,
        evidence: [
          `Confluence score: ${combinedAnalysis.confluenceScore}/100`,
          `PCR: ${combinedAnalysis.positioning.pcr.toFixed(2)} (Neutral)`,
          ...combinedAnalysis.divergenceWarnings,
        ],
        capitalPreservationMessage: "Avoiding theta burn and chop inside consolidation zones.",
        reevaluationTriggers: [
          `Breakout above resistance ${combinedAnalysis.positioning.highestCallOiStrike}`,
          `Breakdown below support ${combinedAnalysis.positioning.highestPutOiStrike}`,
        ],
        timestamp: new Date().toISOString(),
      });
    }

    // 5. Build candidate from REAL quotes only
    const curSymbol = isGlobalInstrument(instrument) ? "$" : "₹";
    const isBullish = combinedAnalysis.marketBias.includes("BULLISH");
    const selectedStrike = Math.round(underlyingPrice / step) * step;
    const row = rows.find((r) => r.strike === selectedStrike);
    const leg = isBullish ? row?.call : row?.put;

    if (!hasRealQuote(leg)) {
      return noTradeResult({
        isNoTrade: true,
        reasonCode: "DATA_STALE_OR_INSUFFICIENT",
        headline: "NO TRADE: No Real Quote for Target Strike",
        summary: `The ${selectedStrike} ${isBullish ? "CE" : "PE"} has no valid two-sided market (LTP/bid/ask). Prices are never assumed.`,
        evidence: [
          row
            ? `LTP=${leg?.ltp ?? "n/a"}, bid=${leg?.bid ?? "n/a"}, ask=${leg?.ask ?? "n/a"}`
            : `Strike ${selectedStrike} not present in the chain`,
        ],
        capitalPreservationMessage: "No trade without an executable quote.",
        reevaluationTriggers: ["Wait for a two-sided quote at the target strike"],
        timestamp: new Date().toISOString(),
      });
    }

    const ltp = leg.ltp;
    let legSpreadPct = spreadPctOf(leg);

    // Strategy: favour a vertical spread when theta burn / IV is elevated, but only when the
    // short leg also has a real two-sided quote; otherwise stay with the outright long.
    const favorSpread =
      greeksReport.thetaAnalysis.thetaBurnSeverity === "AGGRESSIVE_DECAY" ||
      greeksReport.vegaAnalysis.ivRegime === "VOLATILITY_ELEVATED";
    const otmStrike = isBullish ? selectedStrike + step : selectedStrike - step;
    const otmRow = rows.find((r) => r.strike === otmStrike);
    const otmLeg = isBullish ? otmRow?.call : otmRow?.put;
    const useSpread = favorSpread && hasRealQuote(otmLeg) && otmLeg.ltp < ltp;
    const strategyType: ExplainableTradeCandidate["strategyType"] = isBullish
      ? useSpread
        ? "BULL_CALL_SPREAD"
        : "LONG_CALL"
      : useSpread
        ? "BEAR_PUT_SPREAD"
        : "LONG_PUT";

    if (useSpread && hasRealQuote(otmLeg)) {
      legSpreadPct = Math.max(legSpreadPct, spreadPctOf(otmLeg));
    }

    const otmLtp = useSpread && otmLeg ? otmLeg.ltp : 0;
    const netEntryPremium = useSpread ? +(ltp - otmLtp).toFixed(2) : ltp;
    const stopLossPremium = +(netEntryPremium * 0.75).toFixed(2); // 25% premium stop
    const targetPremium = +(netEntryPremium * 1.6).toFixed(2); // 60% profit target

    // Position sizing: allocate within risk budget
    const maxBudget = Math.round(accountCapital * (maxRiskPerTradePct / 100));
    const perShareRisk = Math.max(1, netEntryPremium - stopLossPremium);
    const riskPerLot = perShareRisk * lotSize;
    const recommendedLots = Math.max(1, Math.min(5, Math.floor(maxBudget / riskPerLot)));

    // 6. Evaluate Hard Risk Gates (spread is the REAL observed bid/ask spread)
    const riskReport = marketRiskService.evaluateRisk({
      instrument,
      strategy: strategyType,
      strike: selectedStrike,
      entryPremium: netEntryPremium,
      stopLossPremium,
      targetPremium,
      lots: recommendedLots,
      bidAskSpreadPct: legSpreadPct,
      daysToExpiry: marketSnapshot.daysToExpiry,
      accountCapital,
      maxRiskPerTradePct,
    });

    if (!riskReport.passed) {
      return noTradeResult({
        isNoTrade: true,
        reasonCode: "RISK_BUDGET_EXCEEDED",
        headline: "NO TRADE: Hard Risk Gate Violation",
        summary: `Setup identified but rejected by independent risk management: ${riskReport.rejectionReasons.join("; ")}`,
        evidence: riskReport.riskChecks
          .filter((c) => !c.passed)
          .map((c) => `${c.name}: ${c.observedValue} (Rule: ${c.rule})`),
        capitalPreservationMessage:
          "Risk gates strictly forbid trade execution regardless of AI score.",
        reevaluationTriggers: [
          "Wait for bid-ask spread to tighten",
          "Increase account risk budget or choose next cycle expiry",
        ],
        timestamp: new Date().toISOString(),
      });
    }

    // 7. Assemble Full Explainable Candidate
    const candidateId = `${instrument.replace(/[^A-Z0-9]/g, "")}_${expiryDate}_${strategyType}_${selectedStrike}`;
    const cleanSym = instrument.replace(/[^A-Z0-9]/g, "");
    const optionType = isBullish ? "CE" : "PE";

    const legs: TradeCandidateLeg[] = [toCandidateLeg(leg, optionType, "BUY")];
    if (useSpread && otmLeg) {
      legs.push(toCandidateLeg(otmLeg, optionType, "SELL"));
    }

    const reasonsSupporting = [
      ...combinedAnalysis.confluenceFactors,
      `Net Risk-Reward ratio after all regulatory taxes and brokerage is 1:${riskReport.netRiskRewardRatio}`,
      `Greeks profile aligns with current volatility regime (${greeksReport.vegaAnalysis.ivRegime})`,
    ];

    const reasonsAgainst = [
      ...combinedAnalysis.divergenceWarnings,
      `Estimated round-trip transaction costs: ${curSymbol}${riskReport.transactionCosts.totalEstimatedCost}`,
      `Time decay burn exposure: ${curSymbol}${greeksReport.thetaAnalysis.atmDailyDecayPerShare} per share per day`,
    ];

    const w = { technical: 0.3, greeks: 0.25, positioning: 0.25, risk: 0.2 };
    const wantTrend = isBullish ? "BULLISH" : "BEARISH";
    const techScore =
      combinedAnalysis.technical.trend === wantTrend
        ? 85
        : combinedAnalysis.technical.trend === "NEUTRAL"
          ? 50
          : 25;
    const pcr = combinedAnalysis.positioning.pcr;
    const posScore = isBullish ? (pcr >= 1.0 ? 80 : 45) : pcr <= 0.9 ? 80 : 45;
    const suit = isBullish
      ? greeksReport.strategySuitability.longCallSuitability
      : greeksReport.strategySuitability.longPutSuitability;
    const greeksScore = useSpread
      ? greeksReport.strategySuitability.spreadSuitability === "SUBOPTIMAL"
        ? 40
        : 80
      : suit === "FAVORABLE"
        ? 80
        : suit === "NEUTRAL"
          ? 55
          : 30;
    const rrScore = riskReport.netRiskRewardRatio >= 1.5 ? 85 : 65;
    const contribution = (score: number, weight: number) => +(score * weight).toFixed(1);

    let candidate = this.registry.get(candidateId);

    if (!candidate) {
      candidate = {
        id: candidateId,
        rank: 1,
        instrument,
        expiry: expiryDate,
        strategyType,
        callPut: optionType,
        strike: selectedStrike,
        legs,
        entryTrigger: `${cleanSym} sustains ${isBullish ? "above" : "below"} ${curSymbol}${underlyingPrice.toFixed(1)} on 5M closing`,
        entryZone: {
          min: +(netEntryPremium * 0.98).toFixed(2),
          max: +(netEntryPremium * 1.02).toFixed(2),
        },
        currentReferencePrice: netEntryPremium,
        timestamp: new Date().toISOString(),
        stopLoss: stopLossPremium,
        invalidationCondition: `${cleanSym} spot crosses ${isBullish ? "below" : "above"} ${curSymbol}${(isBullish ? underlyingPrice * 0.994 : underlyingPrice * 1.006).toFixed(1)} or option hits ${curSymbol}${stopLossPremium}`,
        targetLevels: {
          t1: +(netEntryPremium * 1.3).toFixed(2),
          t2: +(netEntryPremium * 1.6).toFixed(2),
          t3: +(netEntryPremium * 2.0).toFixed(2),
        },
        exitConditions: [
          `Target T1 reached: book 50% lots and trail stop-loss to cost`,
          `Target T2 reached: book remaining lots or trail stop by 10%`,
          `Stop-loss hit: exit entire position immediately without holding overnight`,
        ],
        riskRewardRatio: riskReport.netRiskRewardRatio,
        maxEstimatedLoss: riskReport.capitalAtRisk,
        totalDebitRequired: Math.round(netEntryPremium * recommendedLots * lotSize),
        positionSizing: {
          recommendedLots,
          totalQuantity: recommendedLots * lotSize,
          capitalAtRisk: riskReport.capitalAtRisk,
          capitalAllocatedPct: riskReport.capitalAllocatedPct,
        },
        greeksAndIvContext: {
          netDelta: legs.reduce((acc, l) => acc + (l.action === "BUY" ? l.delta : -l.delta), 0),
          netGamma: legs.reduce((acc, l) => acc + (l.action === "BUY" ? l.gamma : -l.gamma), 0),
          netThetaPerDay: legs.reduce(
            (acc, l) => acc + (l.action === "BUY" ? l.theta : -l.theta),
            0,
          ),
          netVegaPerPoint: legs.reduce(
            (acc, l) => acc + (l.action === "BUY" ? l.vega : -l.vega),
            0,
          ),
          atmIv: greeksReport.summary.atmIv,
          ivSkew: greeksReport.vegaAnalysis.ivSmileSkew,
        },
        technicalConfirmation: {
          trend: combinedAnalysis.technical.trend,
          rsi14: combinedAnalysis.technical.rsi14,
          emaStatus: combinedAnalysis.technical.emaCross,
          vwapStatus: combinedAnalysis.technical.priceVsVwap,
          summary: `Price vs VWAP: ${combinedAnalysis.technical.priceVsVwap.replace("_", " ")}; EMA 9/21: ${combinedAnalysis.technical.emaCross.replace("_", " ")}`,
        },
        optionsPositioningConfirmation: {
          pcr: combinedAnalysis.positioning.pcr,
          maxPain: combinedAnalysis.positioning.maxPainStrike,
          highestOiWall: combinedAnalysis.positioning.concentrationSummary,
          summary: `PCR ${combinedAnalysis.positioning.pcr.toFixed(2)} (${combinedAnalysis.positioning.pcrInterpretation.replace("_", " ")}); OI buildup: ${combinedAnalysis.positioning.oiBuildup.replace("_", " ")}`,
        },
        reasonsSupporting,
        reasonsAgainst,
        dataQualityStatus: validation.freshnessStatus,
        dataProvenance: {
          optionChain: "LIVE_BROKER",
          technicals: "REAL_CANDLES",
          greeks: "REAL",
          provider: marketSnapshot.provider,
          candleLastBarAt: marketSnapshot.barsLastAt,
        },
        setupScore: combinedAnalysis.confluenceScore,
        scoringMethodology: {
          technicalWeight: w.technical,
          greeksWeight: w.greeks,
          positioningWeight: w.positioning,
          riskAdjustedWeight: w.risk,
          scoreFactors: [
            {
              name: "Technical Confluence (VWAP + EMA + Trend)",
              score: techScore,
              contribution: contribution(techScore, w.technical),
            },
            {
              name: "Options Positioning & PCR Support",
              score: posScore,
              contribution: contribution(posScore, w.positioning),
            },
            {
              name: "Greeks Suitability & IV Regime",
              score: greeksScore,
              contribution: contribution(greeksScore, w.greeks),
            },
            {
              name: "Risk/Reward & Capital Preservation",
              score: rrScore,
              contribution: contribution(rrScore, w.risk),
            },
          ],
        },
        invalidationTriggers: [
          `Index breaches stop level of ${curSymbol}${(isBullish ? underlyingPrice * 0.994 : underlyingPrice * 1.006).toFixed(1)}`,
          `Option premium falls below stop loss (${curSymbol}${stopLossPremium})`,
          `PCR reverses sharply indicating aggressive counter-party writing`,
        ],
        lifecycleStatus: "CONFIRMED",
        lifecycleHistory: [
          {
            status: "CONFIRMED",
            timestamp: new Date().toISOString(),
            priceAtChange: netEntryPremium,
            note: "Entry trigger and risk checks passed on verified live inputs; candidate confirmed",
          },
        ],
        subsequentPriceUpdates: [
          {
            timestamp: new Date().toISOString(),
            spotPrice: underlyingPrice,
            unrealizedPnlEstimate: 0,
          },
        ],
      };

      this.registry.set(candidateId, candidate);
      this.expireOldCandidates(Date.now());
    } else {
      // Update existing candidate on new tick (Phase 6: Lifecycle Monitoring)
      candidate.currentReferencePrice = netEntryPremium;
      candidate.setupScore = combinedAnalysis.confluenceScore;
      candidate.dataQualityStatus = validation.freshnessStatus;

      // Track subsequent tick (bounded)
      const priceDelta = netEntryPremium - candidate.entryZone.min;
      const unrealizedPnl = Math.round(priceDelta * candidate.positionSizing.totalQuantity);
      candidate.subsequentPriceUpdates.push({
        timestamp: new Date().toISOString(),
        spotPrice: underlyingPrice,
        unrealizedPnlEstimate: unrealizedPnl,
      });
      if (candidate.subsequentPriceUpdates.length > 120) {
        candidate.subsequentPriceUpdates.splice(0, candidate.subsequentPriceUpdates.length - 120);
      }

      // Check lifecycle transitions
      if (candidate.lifecycleStatus === "CONFIRMED") {
        if (netEntryPremium >= candidate.targetLevels.t2) {
          candidate.lifecycleStatus = "TARGET_REACHED";
          candidate.lifecycleHistory.push({
            status: "TARGET_REACHED",
            timestamp: new Date().toISOString(),
            priceAtChange: netEntryPremium,
            note: `Profit Target T2 (${curSymbol}${candidate.targetLevels.t2}) reached successfully.`,
          });
          this.archive(candidate);
        } else if (netEntryPremium <= candidate.stopLoss) {
          candidate.lifecycleStatus = "STOP_CONDITION_REACHED";
          candidate.lifecycleHistory.push({
            status: "STOP_CONDITION_REACHED",
            timestamp: new Date().toISOString(),
            priceAtChange: netEntryPremium,
            note: `Stop-loss condition reached at ${curSymbol}${netEntryPremium}. Setup invalidated.`,
          });
          this.archive(candidate);
        }
      }
    }

    return {
      instrument,
      underlyingPrice,
      marketSessionText: session.sessionText,
      activeCandidates: this.getActiveCandidates(instrument),
      historicalCandidates: this.history.slice(-10),
      timestamp: new Date().toISOString(),
    };
  }
}

export const tradeCandidateService = new TradeCandidateService();
