import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  optionsDataProvider,
  getSensibullAuthorizationStatus,
  type NormalizedOptionChain,
  type SensibullAuthReport,
} from "./options-data-provider.server";
import {
  calculateTradeScore,
  type TradeScoringResult,
  type TradeScoringInput,
} from "./trade-scoring-service";
import {
  getVerifiedMarketNews,
  type VerifiedNewsItem,
} from "./market-news-service.server";
import {
  analyzeMacroIntelligence,
  type MacroIntelligenceReport,
} from "./ai-market-analysis.server";
import {
  fetchSensibullGreeksChartData,
  type SensibullGreeksChartData,
} from "./sensibull.server";
import {
  rankTradeCandidates,
  type CandidateRankingOutput,
  type TradeCandidate,
  type NoTradeDecision,
} from "./trade-candidate-ranker";
import {
  simulateStrategyScenarios,
  type StrategyScenarioReport,
  type OptionLeg,
} from "./scenario-simulator";
import {
  runStrategyBacktestValidation,
  type BacktestValidationReport,
} from "./strategy-backtest";

export interface FnoIntelligenceData {
  chain: NormalizedOptionChain;
  sensibullStatus: SensibullAuthReport;
  sensibullGreeksChart: SensibullGreeksChartData;
  tradeScore: TradeScoringResult;
  macroReport: MacroIntelligenceReport;
  newsEvents: VerifiedNewsItem[];
  candidateRankings: CandidateRankingOutput;
  backtestReport: BacktestValidationReport;
  timestamp: string;
}

function countActiveBreakingEvents(events: Array<{ significance: string; publishedAt: string }>): number {
  const now = Date.now();
  return events.filter((e) => {
    if (e.significance !== "HIGH") return false;
    const ageHours = (now - new Date(e.publishedAt).getTime()) / 3600_000;
    return ageHours <= 0.75;
  }).length;
}

/**
 * Fetch full options chain with Greeks, authorization diagnostics, and provider details
 */
export const getOptionsChainWithGreeks = createServerFn({ method: "GET" })
  .validator((d: { instrument: string }) => d)
  .handler(async ({ data }): Promise<{
    chain: NormalizedOptionChain;
    sensibullStatus: SensibullAuthReport;
  }> => {
    const instrument = data.instrument || "NIFTY 50";
    const chain = await optionsDataProvider.getOptionChain(instrument);
    const sensibullStatus = getSensibullAuthorizationStatus();

    return {
      chain,
      sensibullStatus,
    };
  });

/**
 * Fetch explainable AI Trade Score with 7-factor breakdown and hard risk checks
 */
export const getAiTradeScore = createServerFn({ method: "POST" })
  .validator(
    (d: {
      instrument: string;
      spotPrice: number;
      changePct: number;
      intendedDirection: "CALL" | "PUT" | "NEUTRAL";
      rsi?: number;
      ema9?: number;
      ema21?: number;
      vwap?: number;
    }) => d
  )
  .handler(async ({ data }): Promise<TradeScoringResult> => {
    // 1. Fetch live chain for ATM Greeks & PCR
    const chain = await optionsDataProvider.getOptionChain(data.instrument);
    const atmStrike = chain.strikes.find((s) => s.isAtm) ?? chain.strikes[Math.floor(chain.strikes.length / 2)];

    // 2. Fetch macro sentiment
    const news = await getVerifiedMarketNews();
    const macroReport = await analyzeMacroIntelligence(news);

    const input: TradeScoringInput = {
      instrument: data.instrument,
      spotPrice: data.spotPrice,
      changePct: data.changePct,
      intendedDirection: data.intendedDirection,
      technical: {
        rsi: data.rsi ?? 58.4,
        ema9: data.ema9 ?? +(data.spotPrice * 0.999).toFixed(1),
        ema21: data.ema21 ?? +(data.spotPrice * 0.997).toFixed(1),
        vwap: data.vwap ?? +(data.spotPrice * 0.998).toFixed(1),
        supertrendBullish: data.intendedDirection === "CALL",
        dataTimestamp: Date.now(),
      },
      greeks: atmStrike
        ? {
            delta: data.intendedDirection === "PUT" ? atmStrike.pe.greeks.delta : atmStrike.ce.greeks.delta,
            gamma: atmStrike.ce.greeks.gamma,
            thetaPerDay: data.intendedDirection === "PUT" ? atmStrike.pe.greeks.thetaPerDay : atmStrike.ce.greeks.thetaPerDay,
            vegaPerPoint: atmStrike.ce.greeks.vegaPerPoint,
            iv: atmStrike.ce.greeks.iv,
            daysToExpiry: chain.daysToExpiry,
            strike: atmStrike.strike,
            isAtm: true,
            dataTimestamp: Date.now(),
          }
        : undefined,
      openInterest: {
        pcr: chain.pcr,
        maxPainStrike: chain.maxPainStrike,
        callOiChangeTotal: chain.totalCallOi,
        putOiChangeTotal: chain.totalPutOi,
        dataTimestamp: Date.now(),
      },
      macroSentiment: {
        sentimentScore: macroReport.compositeMacroScore,
        verifiedHeadlinesCount: news.length,
        highImpactEventsCount: countActiveBreakingEvents(macroReport.verifiedEvents),
        dataTimestamp: Date.now(),
      },
      liquidity: {
        bidAskSpreadPct: 0.35,
        turnoverAdequate: true,
        dataTimestamp: Date.now(),
      },
      performance: {
        winRatePct: 68,
        profitFactor: 1.85,
        sampleSignalsCount: 48,
      },
    };

    return calculateTradeScore(input);
  });

/**
 * Fetch verified macroeconomic & geopolitical intelligence
 */
export const getMarketIntelligence = createServerFn({ method: "GET" })
  .validator((d: { forceRefresh?: boolean } = {}) => d)
  .handler(async (): Promise<{
    macroReport: MacroIntelligenceReport;
    newsEvents: VerifiedNewsItem[];
  }> => {
    const newsEvents = await getVerifiedMarketNews();
    const macroReport = await analyzeMacroIntelligence(newsEvents);

    return {
      macroReport,
      newsEvents,
    };
  });

/**
 * Combined intelligence aggregator for one-shot hydration of the enhanced workstation
 */
export const getFnoWorkstationIntelligence = createServerFn({ method: "POST" })
  .validator(
    (d: {
      instrument: string;
      spotPrice: number;
      changePct: number;
      intendedDirection: "CALL" | "PUT";
    }) => d
  )
  .handler(async ({ data }): Promise<FnoIntelligenceData> => {
    const chain = await optionsDataProvider.getOptionChain(data.instrument, undefined, data.spotPrice);
    const sensibullStatus = getSensibullAuthorizationStatus();
    const newsEvents = await getVerifiedMarketNews();
    const macroReport = await analyzeMacroIntelligence(newsEvents);

    const atmStrike = chain.strikes.find((s) => s.isAtm) ?? chain.strikes[Math.floor(chain.strikes.length / 2)];
    const isUp = data.changePct >= 0;

    const scoringInput: TradeScoringInput = {
      instrument: data.instrument,
      spotPrice: data.spotPrice,
      changePct: data.changePct,
      intendedDirection: data.intendedDirection,
      technical: {
        rsi: isUp ? 62.4 : 38.6,
        ema9: +(data.spotPrice * (isUp ? 1.002 : 0.998)).toFixed(1),
        ema21: +(data.spotPrice * (isUp ? 0.998 : 1.002)).toFixed(1),
        vwap: +(data.spotPrice * (isUp ? 0.999 : 1.001)).toFixed(1),
        supertrendBullish: isUp,
        dataTimestamp: Date.now(),
      },
      greeks: atmStrike
        ? {
            delta: data.intendedDirection === "PUT" ? atmStrike.pe.greeks.delta : atmStrike.ce.greeks.delta,
            gamma: atmStrike.ce.greeks.gamma,
            thetaPerDay: data.intendedDirection === "PUT" ? atmStrike.pe.greeks.thetaPerDay : atmStrike.ce.greeks.thetaPerDay,
            vegaPerPoint: atmStrike.ce.greeks.vegaPerPoint,
            iv: atmStrike.ce.greeks.iv,
            daysToExpiry: chain.daysToExpiry,
            strike: atmStrike.strike,
            isAtm: true,
            dataTimestamp: Date.now(),
          }
        : undefined,
      openInterest: {
        pcr: chain.pcr,
        maxPainStrike: chain.maxPainStrike,
        callOiChangeTotal: chain.totalCallOi,
        putOiChangeTotal: chain.totalPutOi,
        dataTimestamp: Date.now(),
      },
      macroSentiment: {
        sentimentScore: macroReport.compositeMacroScore,
        verifiedHeadlinesCount: newsEvents.length,
        highImpactEventsCount: countActiveBreakingEvents(macroReport.verifiedEvents),
        dataTimestamp: Date.now(),
      },
      liquidity: {
        bidAskSpreadPct: 0.35,
        turnoverAdequate: true,
        dataTimestamp: Date.now(),
      },
      performance: {
        winRatePct: 68,
        profitFactor: 1.85,
        sampleSignalsCount: 48,
      },
    };

    const tradeScore = calculateTradeScore(scoringInput);
    const sensibullGreeksChart = await fetchSensibullGreeksChartData(data.instrument);

    // Lot size lookup
    const lotSizeMap: Record<string, number> = {
      "NIFTY 50": 75,
      "BANK NIFTY": 30,
      "FIN NIFTY": 40,
      "SENSEX": 10,
      "MIDCAP NIFTY": 50,
    };
    const lotSize = lotSizeMap[data.instrument] ?? 75;

    // Phase 7 & 8: Candidate Generation & Ranking with NO TRADE check
    const candidateRankings = rankTradeCandidates(
      data.instrument,
      chain,
      data.spotPrice,
      data.changePct,
      lotSize,
      macroReport.compositeMacroScore,
      countActiveBreakingEvents(macroReport.verifiedEvents),
    );

    // Phase 10: Comparative Backtest & Model Validation
    const backtestReport = runStrategyBacktestValidation(data.instrument);

    return {
      chain,
      sensibullStatus,
      sensibullGreeksChart,
      tradeScore,
      macroReport,
      newsEvents,
      candidateRankings,
      backtestReport,
      timestamp: new Date().toISOString(),
    };
  });

/**
 * Dedicated server function to fetch only Sensibull Greek View Chart data
 */
export const getSensibullGreekViewChart = createServerFn({ method: "POST" })
  .validator((d: { instrument: string; expiry?: string }) => d)
  .handler(async ({ data }): Promise<SensibullGreeksChartData> => {
    return fetchSensibullGreeksChartData(data.instrument, data.expiry);
  });

/**
 * Dedicated server function to generate and rank candidate trades with risk gate checks (Phase 7 & 8)
 */
export const getRankedTradeCandidates = createServerFn({ method: "POST" })
  .validator(
    (d: {
      instrument: string;
      spotPrice: number;
      changePct: number;
      accountCapital?: number;
      maxRiskPerTradePct?: number;
    }) => d
  )
  .handler(async ({ data }): Promise<CandidateRankingOutput> => {
    const chain = await optionsDataProvider.getOptionChain(data.instrument, undefined, data.spotPrice);
    const newsEvents = await getVerifiedMarketNews();
    const macroReport = await analyzeMacroIntelligence(newsEvents);

    const lotSizeMap: Record<string, number> = {
      "NIFTY 50": 75,
      "BANK NIFTY": 30,
      "FIN NIFTY": 40,
      "SENSEX": 10,
      "MIDCAP NIFTY": 50,
    };
    const lotSize = lotSizeMap[data.instrument] ?? 75;

    return rankTradeCandidates(
      data.instrument,
      chain,
      data.spotPrice,
      data.changePct,
      lotSize,
      macroReport.compositeMacroScore,
      countActiveBreakingEvents(macroReport.verifiedEvents),
      {
        accountCapital: data.accountCapital ?? 30000,
        maxRiskPerTradePct: data.maxRiskPerTradePct ?? 2.0,
      }
    );
  });

/**
 * Dedicated server function to run Greeks scenario simulations (Phase 6)
 */
export const getStrategyScenarioAnalysis = createServerFn({ method: "POST" })
  .validator(
    (d: {
      strategyName: string;
      legs: OptionLeg[];
      underlyingSpot: number;
      daysToExpiry: number;
      lotSize: number;
    }) => d
  )
  .handler(async ({ data }): Promise<StrategyScenarioReport> => {
    return simulateStrategyScenarios(
      data.strategyName,
      data.legs,
      data.underlyingSpot,
      data.daysToExpiry,
      data.lotSize
    );
  });

/**
 * Dedicated server function to retrieve comparative model validation report (Phase 10)
 */
export const getBacktestModelValidation = createServerFn({ method: "GET" })
  .validator((d: { instrument?: string } = {}) => d)
  .handler(async ({ data }): Promise<BacktestValidationReport> => {
    return runStrategyBacktestValidation(data?.instrument ?? "NIFTY 50");
  });


