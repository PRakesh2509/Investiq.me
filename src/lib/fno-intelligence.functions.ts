import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  optionsDataProvider,
  getSensibullAuthorizationStatus,
  type NormalizedOptionChain,
  type SensibullAuthReport,
  type ProviderStatusInfo,
} from "./options-data-provider.server";
import {
  calculateTradeScore,
  type TradeScoringResult,
  type TradeScoringInput,
} from "./trade-scoring-service";
import { getVerifiedMarketNews, type VerifiedNewsItem } from "./market-news-service.server";
import {
  analyzeMacroIntelligence,
  type MacroIntelligenceReport,
} from "./ai-market-analysis.server";
import { fetchSensibullGreeksChartData, type SensibullGreeksChartData } from "./sensibull.server";
import { rankTradeCandidates, type CandidateRankingOutput } from "./trade-candidate-ranker";
import { simulateStrategyScenarios, type StrategyScenarioReport } from "./scenario-simulator";
import { runStrategyBacktestValidation, type BacktestValidationReport } from "./strategy-backtest";
import { WORKSTATION_INSTRUMENTS, INSTRUMENT_PROFILES } from "./terminal-workstation.functions";
import { getInstrumentBars } from "./market-data-provider.server.ts";
import { ema, rsi, supertrend, vwap } from "./indicators";
import { isValidSymbol, isValidExpiry } from "./provider-utils.ts";

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

/* ------------------------------- input validation ------------------------------- */

const InstrumentSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(isValidSymbol, { message: "Invalid instrument" });
const SpotSchema = z.number().finite().positive().max(1e7);
const ChangePctSchema = z.number().finite().min(-100).max(100);
const OptionalIndicator = z.number().finite().min(-1e9).max(1e9).optional();
const ExpirySchema = z.string().refine(isValidExpiry, { message: "expiry must be YYYY-MM-DD" });

const OptionLegSchema = z.object({
  id: z.string().max(64),
  strike: z.number().finite().positive().max(1e7),
  type: z.enum(["CE", "PE"]),
  action: z.enum(["BUY", "SELL"]),
  quantity: z.number().finite().positive().max(1e7),
  entryPrice: z.number().finite().min(0).max(1e7),
  currentPrice: z.number().finite().min(0).max(1e7),
  iv: z.number().finite().min(0).max(1000),
});

/* --------------------------------- real inputs ---------------------------------- */

function countActiveBreakingEvents(
  events?: Array<{ significance?: string; publishedAt?: string }>,
): number {
  if (!events || !Array.isArray(events)) return 0;
  const now = Date.now();
  return events.filter((e) => {
    if (e.significance !== "HIGH" || !e.publishedAt) return false;
    const ageHours = (now - new Date(e.publishedAt).getTime()) / 3600_000;
    return ageHours <= 0.75;
  }).length;
}

type TechnicalInput = NonNullable<TradeScoringInput["technical"]>;

/**
 * RSI / EMA / VWAP / Supertrend computed from REAL 5-minute bars (DhanHQ, then Yahoo Finance).
 * Returns undefined when bars are unavailable so the scoring engine marks the factor missing
 * instead of receiving an invented number.
 */
async function loadRealTechnicals(
  instrument: string,
  overrides: { rsi?: number; ema9?: number; ema21?: number; vwap?: number } = {},
): Promise<TechnicalInput | undefined> {
  const cfg = WORKSTATION_INSTRUMENTS[instrument];
  if (!cfg) return undefined;
  const result = await getInstrumentBars({
    yahooSymbol: cfg.yahooSymbol,
    interval: "5m",
    range: "5d",
    isGlobal: Boolean(cfg.isGlobal),
    dhan: cfg.isGlobal ? undefined : { symbol: instrument, range: "5d", minutes: 5 },
  });
  if (!result || result.bars.length < 30) return undefined;

  const bars = result.bars;
  const closes = bars.map((b) => b.close);
  const last = <T>(arr: (T | null)[]): T | undefined => {
    const v = arr[arr.length - 1];
    return v === null || v === undefined ? undefined : v;
  };
  const st = supertrend(bars, 10, 3);
  const dir = st.direction[st.direction.length - 1];
  return {
    rsi: overrides.rsi ?? last(rsi(closes, 14)),
    ema9: overrides.ema9 ?? last(ema(closes, 9)),
    ema21: overrides.ema21 ?? last(ema(closes, 21)),
    vwap: overrides.vwap ?? last(vwap(bars)),
    supertrendBullish: dir === null || dir === undefined ? undefined : dir === 1,
    dataTimestamp: result.asOfMs,
    simulated: false,
  };
}

function atmRowOf(chain: NormalizedOptionChain) {
  if (chain.unavailable || chain.rows.length === 0) return undefined;
  return chain.rows.find((s) => s.isAtm) ?? chain.rows[Math.floor(chain.rows.length / 2)];
}

function greeksInput(
  chain: NormalizedOptionChain,
  direction: "CALL" | "PUT" | "NEUTRAL",
): TradeScoringInput["greeks"] {
  const atm = atmRowOf(chain);
  if (!atm) return undefined;
  const leg = direction === "PUT" ? atm.pe : atm.ce;
  return {
    delta: leg.greeks.delta,
    gamma: atm.ce.greeks.gamma,
    thetaPerDay: leg.greeks.thetaPerDay,
    vegaPerPoint: atm.ce.greeks.vegaPerPoint,
    iv: atm.ce.greeks.iv,
    daysToExpiry: chain.daysToExpiry,
    strike: atm.strike,
    isAtm: true,
    dataTimestamp: chain.providerTimestamp,
    simulated: Boolean(chain.isSimulated),
  };
}

function openInterestInput(chain: NormalizedOptionChain): TradeScoringInput["openInterest"] {
  if (chain.unavailable || chain.rows.length === 0) return undefined;
  return {
    pcr: chain.pcr,
    maxPainStrike: chain.maxPainStrike,
    callOiChangeTotal: chain.rows.reduce((s, r) => s + r.ce.oiChange, 0),
    putOiChangeTotal: chain.rows.reduce((s, r) => s + r.pe.oiChange, 0),
    dataTimestamp: chain.providerTimestamp,
    simulated: Boolean(chain.isSimulated),
  };
}

/** Bid/ask spread of the ATM call from the real chain; undefined when no two-sided quote. */
function liquidityInput(chain: NormalizedOptionChain): TradeScoringInput["liquidity"] {
  const atm = atmRowOf(chain);
  if (!atm) return undefined;
  const { bid, ask, volume } = atm.ce;
  if (bid === null || ask === null || bid <= 0 || ask < bid) return undefined;
  const mid = (bid + ask) / 2;
  return {
    bidAskSpreadPct: +(((ask - bid) / mid) * 100).toFixed(2),
    avgLotVolume: volume,
    dataTimestamp: chain.providerTimestamp,
    simulated: Boolean(chain.isSimulated),
  };
}

/* ---------------------------------- server fns ---------------------------------- */

/**
 * Fetch full options chain with Greeks, authorization diagnostics, and provider details
 */
export const getOptionsChainWithGreeks = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ instrument: InstrumentSchema.default("NIFTY 50") }).parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      chain: NormalizedOptionChain;
      sensibullStatus: SensibullAuthReport;
    }> => {
      const chain = await optionsDataProvider.getOptionChain(data.instrument);
      const sensibullStatus = getSensibullAuthorizationStatus();

      return {
        chain,
        sensibullStatus,
      };
    },
  );

/**
 * Fetch explainable AI Trade Score with 7-factor breakdown and hard risk checks
 */
export const getAiTradeScore = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        instrument: InstrumentSchema,
        spotPrice: SpotSchema,
        changePct: ChangePctSchema,
        intendedDirection: z.enum(["CALL", "PUT", "NEUTRAL"]),
        rsi: OptionalIndicator,
        ema9: OptionalIndicator,
        ema21: OptionalIndicator,
        vwap: OptionalIndicator,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<TradeScoringResult> => {
    // 1. Real chain (ATM Greeks, PCR, liquidity) and real intraday technicals, in parallel
    const [chain, technical, news] = await Promise.all([
      optionsDataProvider.getOptionChain(data.instrument),
      loadRealTechnicals(data.instrument, data),
      getVerifiedMarketNews(),
    ]);

    // 2. Fetch macro sentiment
    const macroReport = await analyzeMacroIntelligence(news);

    const input: TradeScoringInput = {
      instrument: data.instrument,
      spotPrice: data.spotPrice,
      changePct: data.changePct,
      intendedDirection: data.intendedDirection,
      technical,
      greeks: greeksInput(chain, data.intendedDirection),
      openInterest: openInterestInput(chain),
      macroSentiment: {
        sentimentScore: macroReport.compositeMacroScore,
        verifiedHeadlinesCount: news.length,
        highImpactEventsCount: countActiveBreakingEvents(macroReport.verifiedEvents),
        dataTimestamp: Date.now(),
      },
      liquidity: liquidityInput(chain),
    };

    return calculateTradeScore(input);
  });

/**
 * Fetch verified macroeconomic & geopolitical intelligence
 */
export const getMarketIntelligence = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ forceRefresh: z.boolean().optional() }).parse(d ?? {}))
  .handler(
    async ({
      data,
    }): Promise<{
      macroReport: MacroIntelligenceReport;
      newsEvents: VerifiedNewsItem[];
    }> => {
      const newsEvents = await getVerifiedMarketNews(data?.forceRefresh);
      const macroReport = await analyzeMacroIntelligence(
        newsEvents,
        "NIFTY 50",
        data?.forceRefresh,
      );

      return {
        macroReport,
        newsEvents,
      };
    },
  );

/**
 * Combined intelligence aggregator for one-shot hydration of the enhanced workstation
 */
export const getFnoWorkstationIntelligence = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        instrument: InstrumentSchema,
        spotPrice: SpotSchema,
        changePct: ChangePctSchema,
        intendedDirection: z.enum(["CALL", "PUT"]),
        forceRefresh: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FnoIntelligenceData> => {
    const cfg = WORKSTATION_INSTRUMENTS[data.instrument] ?? WORKSTATION_INSTRUMENTS["NIFTY 50"];
    const profile = INSTRUMENT_PROFILES[data.instrument] ?? INSTRUMENT_PROFILES["NIFTY 50"];
    const isGlobal = Boolean(cfg.isGlobal);

    const [chain, technical] = await Promise.all([
      optionsDataProvider.getOptionChain(data.instrument, undefined, data.spotPrice),
      loadRealTechnicals(data.instrument),
    ]);
    const sensibullStatus: ProviderStatusInfo = isGlobal
      ? {
          providerName: "CBOE / CME" as const,
          isAuthorized: chain.dataSource === "cboe-delayed",
          status:
            chain.dataSource === "cboe-delayed"
              ? ("GLOBAL_FEED" as const)
              : ("CONFIG_MISSING" as const),
          reason:
            chain.dataSource === "cboe-delayed"
              ? "CBOE delayed (about 15 minutes) global options feed active."
              : "Global options feed is not enabled or unreachable (set ENABLE_GLOBAL_OPTIONS_FEED=true to use CBOE delayed quotes).",
          documentationUrl: "https://www.cboe.com",
          canStreamLiveData: false,
        }
      : getSensibullAuthorizationStatus();
    const newsEvents = await getVerifiedMarketNews(data.forceRefresh);
    const macroReport = await analyzeMacroIntelligence(
      newsEvents,
      data.instrument,
      data.forceRefresh,
    );

    const scoringInput: TradeScoringInput = {
      instrument: data.instrument,
      spotPrice: data.spotPrice,
      changePct: data.changePct,
      intendedDirection: data.intendedDirection,
      technical,
      greeks: greeksInput(chain, data.intendedDirection),
      openInterest: openInterestInput(chain),
      macroSentiment: {
        sentimentScore: macroReport.compositeMacroScore,
        verifiedHeadlinesCount: newsEvents.length,
        highImpactEventsCount: countActiveBreakingEvents(macroReport.verifiedEvents),
        dataTimestamp: Date.now(),
      },
      liquidity: liquidityInput(chain),
      // The profile's win-rate / profit-factor are static reference numbers, not a live backtest.
      performance: {
        winRatePct: profile.winRate,
        profitFactor: profile.profitFactor,
        sampleSignalsCount: profile.signals,
        simulated: true,
      },
    };

    const tradeScore = calculateTradeScore(scoringInput);
    const sensibullGreeksChart = await fetchSensibullGreeksChartData(data.instrument);
    const lotSize = cfg.lotSize;

    // Phase 7 & 8: Candidate Generation & Ranking with NO TRADE check
    const candidateRankings = rankTradeCandidates(
      data.instrument,
      chain,
      data.spotPrice,
      data.changePct,
      lotSize,
      macroReport.compositeMacroScore,
      countActiveBreakingEvents(macroReport.verifiedEvents),
      {},
      technical,
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
 * Dedicated server function to fetch only the Greeks View chart data
 */
export const getSensibullGreekViewChart = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ instrument: InstrumentSchema, expiry: ExpirySchema.optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<SensibullGreeksChartData> => {
    return fetchSensibullGreeksChartData(data.instrument, data.expiry);
  });

/**
 * Dedicated server function to generate and rank candidate trades with risk gate checks (Phase 7 & 8)
 */
export const getRankedTradeCandidates = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        instrument: InstrumentSchema,
        spotPrice: SpotSchema,
        changePct: ChangePctSchema,
        accountCapital: z.number().finite().positive().max(1e10).optional(),
        maxRiskPerTradePct: z.number().finite().positive().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CandidateRankingOutput> => {
    const cfg = WORKSTATION_INSTRUMENTS[data.instrument] ?? WORKSTATION_INSTRUMENTS["NIFTY 50"];
    const [chain, technical, newsEvents] = await Promise.all([
      optionsDataProvider.getOptionChain(data.instrument, undefined, data.spotPrice),
      loadRealTechnicals(data.instrument),
      getVerifiedMarketNews(),
    ]);
    const macroReport = await analyzeMacroIntelligence(newsEvents);

    return rankTradeCandidates(
      data.instrument,
      chain,
      data.spotPrice,
      data.changePct,
      cfg.lotSize,
      macroReport.compositeMacroScore,
      countActiveBreakingEvents(macroReport.verifiedEvents),
      {
        accountCapital: data.accountCapital ?? 30000,
        maxRiskPerTradePct: data.maxRiskPerTradePct ?? 2.0,
      },
      technical,
    );
  });

/**
 * Dedicated server function to run Greeks scenario simulations (Phase 6)
 */
export const getStrategyScenarioAnalysis = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        strategyName: z.string().trim().min(1).max(80),
        legs: z.array(OptionLegSchema).min(1).max(12),
        underlyingSpot: SpotSchema,
        daysToExpiry: z.number().finite().min(0).max(1000),
        lotSize: z.number().finite().positive().max(100000),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<StrategyScenarioReport> => {
    return simulateStrategyScenarios(
      data.strategyName,
      data.legs,
      data.underlyingSpot,
      data.daysToExpiry,
      data.lotSize,
    );
  });

/**
 * Dedicated server function to retrieve comparative model validation report (Phase 10)
 */
export const getBacktestModelValidation = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ instrument: InstrumentSchema.optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<BacktestValidationReport> => {
    return runStrategyBacktestValidation(data?.instrument ?? "NIFTY 50");
  });
