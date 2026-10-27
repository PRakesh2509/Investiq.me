/**
 * Server-side loaders for the high-profit trade analysis (see `trade-analysis.ts` for the pure
 * derivation). Pulls the gated engine state per instrument and a best-effort macro backdrop from
 * Yahoo Finance, then derives setups. No module-load timers or side effects; caches are bounded
 * and best-effort only (Workers isolates are ephemeral).
 */

import { sensibullContinuousEngine } from "./sensibull-continuous-engine.server.ts";
import {
  WORKSTATION_INSTRUMENTS,
  type TerminalWorkstationData,
} from "./terminal-workstation.functions.ts";
import { TtlSingleFlightCache } from "./services/ttlSingleFlightCache.ts";
import {
  deriveTradeSetup,
  getMarketTiming,
  summarizeMarketSetups,
  unavailableSetupResult,
  type MacroBackdrop,
  type MacroIndicator,
  type MarketSetupsResult,
  type SetupEngineInput,
  type TradeMarket,
  type TradeSetupResult,
} from "./trade-analysis.ts";

/** Instruments evaluated per market when none are requested explicitly. */
export const DEFAULT_SETUP_INSTRUMENTS: Record<TradeMarket, string[]> = {
  NSE_FNO: ["NIFTY 50", "BANK NIFTY"],
  GLOBAL_US: ["S&P 500", "NASDAQ 100"],
};

export interface TradeAnalysisDeps {
  loadEngineState(instrument: string): Promise<SetupEngineInput>;
  loadMacro(market: TradeMarket): Promise<MacroBackdrop | null>;
  now(): number;
}

export interface TradeAnalysisOptions {
  instruments?: string[];
  deps?: Partial<TradeAnalysisDeps>;
}

// ---------------------------------------------------------------------------------------------
// Macro backdrop (Yahoo Finance, optional context)
// ---------------------------------------------------------------------------------------------

type MacroFetcher = (url: string, init: RequestInit) => Promise<Response>;

const MACRO_SYMBOLS: Record<TradeMarket, Array<{ symbol: string; label: string }>> = {
  NSE_FNO: [
    { symbol: "^INDIAVIX", label: "India VIX" },
    { symbol: "BZ=F", label: "Brent crude (USD/bbl)" },
    { symbol: "DX-Y.NYB", label: "US Dollar Index (DXY)" },
    { symbol: "^TNX", label: "US 10Y yield (%)" },
    { symbol: "INR=X", label: "USD/INR" },
  ],
  GLOBAL_US: [
    { symbol: "^VIX", label: "CBOE VIX" },
    { symbol: "CL=F", label: "WTI crude (USD/bbl)" },
    { symbol: "DX-Y.NYB", label: "US Dollar Index (DXY)" },
    { symbol: "^TNX", label: "US 10Y yield (%)" },
  ],
};

const MACRO_TTL_MS = 5 * 60_000;
const MACRO_TIMEOUT_MS = 3_000;
const macroCache = new TtlSingleFlightCache<MacroBackdrop>({ ttlMs: MACRO_TTL_MS, maxEntries: 4 });

interface YahooMetaResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
      };
    }>;
  };
}

async function fetchMacroIndicator(
  fetchImpl: MacroFetcher,
  symbol: string,
  label: string,
): Promise<MacroIndicator | null> {
  try {
    const res = await fetchImpl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
        signal: AbortSignal.timeout(MACRO_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const meta = ((await res.json()) as YahooMetaResponse)?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    const prev = meta?.chartPreviousClose ?? meta?.previousClose;
    const changePct =
      typeof prev === "number" && prev > 0 ? +(((price - prev) / prev) * 100).toFixed(2) : null;
    return {
      symbol,
      label,
      price: +price.toFixed(4),
      changePct,
      asOf:
        typeof meta?.regularMarketTime === "number"
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Real market-wide context (volatility index, crude, dollar, US yields). Never throws: failures
 * yield `available: false`. No sentiment is inferred from these numbers.
 */
export async function fetchMacroBackdrop(
  market: TradeMarket,
  fetchImpl: MacroFetcher = (url, init) => fetch(url, init),
): Promise<MacroBackdrop> {
  const defs = MACRO_SYMBOLS[market];
  const results = await Promise.all(
    defs.map((d) => fetchMacroIndicator(fetchImpl, d.symbol, d.label)),
  );
  const indicators = results.filter((r): r is MacroIndicator => r !== null);
  if (indicators.length === 0) {
    return {
      available: false,
      source: "Yahoo Finance",
      asOf: null,
      indicators: [],
      summary: "Macro quotes unavailable (upstream unreachable or returned no data).",
      note: "No macro or geopolitical narrative is generated without data.",
    };
  }
  const asOfTimes = indicators
    .map((i) => (i.asOf ? Date.parse(i.asOf) : NaN))
    .filter((t) => Number.isFinite(t));
  return {
    available: true,
    source: "Yahoo Finance (may be delayed)",
    asOf: asOfTimes.length ? new Date(Math.max(...asOfTimes)).toISOString() : null,
    indicators,
    summary: indicators
      .map(
        (i) =>
          `${i.label} ${i.price}${i.changePct === null ? "" : ` (${i.changePct >= 0 ? "+" : ""}${i.changePct}% d/d)`}`,
      )
      .join("; "),
    note: "Quotes only: no geopolitical narrative or directional macro sentiment is inferred.",
  };
}

// ---------------------------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------------------------

const defaultDeps: TradeAnalysisDeps = {
  loadEngineState: (instrument) => sensibullContinuousEngine.ensureFresh(instrument),
  loadMacro: async (market) => {
    try {
      return await macroCache.getOrCompute(market, () => fetchMacroBackdrop(market));
    } catch {
      return null;
    }
  },
  now: () => Date.now(),
};

/**
 * Evaluate one instrument and also return the engine state that was used (null when it could not
 * be loaded). Never throws: failures become a DATA_UNAVAILABLE result.
 */
export async function analyzeInstrument(
  instrument: string,
  market: TradeMarket,
  deps: Partial<TradeAnalysisDeps> = {},
): Promise<{
  result: TradeSetupResult;
  state: SetupEngineInput | null;
  macro: MacroBackdrop | null;
}> {
  const d = { ...defaultDeps, ...deps };
  const cfg = Object.prototype.hasOwnProperty.call(WORKSTATION_INSTRUMENTS, instrument)
    ? WORKSTATION_INSTRUMENTS[instrument]
    : undefined;
  if (!cfg) {
    return {
      result: unavailableSetupResult(
        instrument,
        market,
        `Unknown instrument: ${instrument}`,
        d.now(),
      ),
      state: null,
      macro: null,
    };
  }
  let state: SetupEngineInput | null = null;
  let macro: MacroBackdrop | null = null;
  try {
    const [loaded, loadedMacro] = await Promise.all([
      d.loadEngineState(instrument),
      d.loadMacro(market).catch(() => null),
    ]);
    state = loaded;
    macro = loadedMacro;
    const result = deriveTradeSetup(loaded, {
      market,
      config: { lotSize: cfg.lotSize, currency: cfg.currency, isGlobal: cfg.isGlobal },
      nowMs: d.now(),
      macro,
    });
    return { result, state, macro };
  } catch (err) {
    return {
      result: unavailableSetupResult(
        instrument,
        market,
        `Trade analysis failed: ${err instanceof Error ? err.message : "unknown error"}`,
        d.now(),
      ),
      state,
      macro,
    };
  }
}

/** Evaluate one instrument. Never throws: failures become a DATA_UNAVAILABLE result. */
export async function getTradeSetupForInstrument(
  instrument: string,
  market: TradeMarket,
  deps: Partial<TradeAnalysisDeps> = {},
): Promise<TradeSetupResult> {
  return (await analyzeInstrument(instrument, market, deps)).result;
}

/** Map a free-form symbol ("nifty-50", "S&P 500") to a configured instrument of the market. */
export function resolveInstrument(
  symbol: string | null | undefined,
  market: TradeMarket,
): string | null {
  if (!symbol) return null;
  const want = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const [key, cfg] of Object.entries(WORKSTATION_INSTRUMENTS)) {
    if (Boolean(cfg.isGlobal) !== (market === "GLOBAL_US")) continue;
    if (key.toUpperCase().replace(/[^A-Z0-9]/g, "") === want) return key;
  }
  return null;
}

/** Evaluate every requested instrument of a market and summarise (empty `setups` when none). */
export async function getMarketHighProfitTrades(
  market: TradeMarket,
  opts: TradeAnalysisOptions = {},
): Promise<MarketSetupsResult> {
  const d = { ...defaultDeps, ...(opts.deps ?? {}) };
  const instruments = opts.instruments?.length
    ? opts.instruments
    : DEFAULT_SETUP_INSTRUMENTS[market];
  const perInstrument = await Promise.all(
    instruments.map((i) => getTradeSetupForInstrument(i, market, opts.deps)),
  );
  let macro: MacroBackdrop | null = null;
  try {
    macro = await d.loadMacro(market);
  } catch {
    macro = null;
  }
  return summarizeMarketSetups(market, perInstrument, macro, d.now());
}

/** NSE F&O setups derived from live data (empty `setups` + status/reason when unavailable). */
export function getIndianHighProfitTrades(
  opts: TradeAnalysisOptions = {},
): Promise<MarketSetupsResult> {
  return getMarketHighProfitTrades("NSE_FNO", opts);
}

/** US / global index setups derived from live data (empty `setups` + status/reason when unavailable). */
export function getGlobalHighProfitTrades(
  opts: TradeAnalysisOptions = {},
): Promise<MarketSetupsResult> {
  return getMarketHighProfitTrades("GLOBAL_US", opts);
}

// ---------------------------------------------------------------------------------------------
// Signals payload shared by /api/v1/fno/signals and /api/v1/global/signals
// ---------------------------------------------------------------------------------------------

export interface SignalsPayloadArgs {
  market: TradeMarket;
  instrument: string;
  quote: Pick<
    TerminalWorkstationData,
    "ok" | "spotPrice" | "change" | "changePct" | "dataSource" | "freshnessStatus" | "asOf"
  > &
    Partial<Pick<TerminalWorkstationData, "dataQualityNotes">>;
  config: { currency: string; lotSize: number };
  result: TradeSetupResult;
  state: SetupEngineInput | null;
  macro: MacroBackdrop | null;
}

/**
 * Response body for the signals endpoints. Everything is derived from real data; blocks that
 * cannot be computed are null (never placeholders) and `status` / `reason` explain why.
 */
export function buildSignalsPayload(a: SignalsPayloadArgs) {
  const { result, state } = a;
  const setup = result.setup;
  const snap = state?.fnoSnapshot ?? null;
  const tech = state?.fnoSignalAnalysis?.technical ?? null;

  const chartAnalysis = setup
    ? {
        timeframe: setup.chartTechnicals.timeframe,
        trend: setup.chartTechnicals.trend,
        ema20: setup.chartTechnicals.ema20,
        ema50: setup.chartTechnicals.ema50,
        ema200: setup.chartTechnicals.ema200,
        vwap: setup.chartTechnicals.vwap,
        supertrend: setup.chartTechnicals.supertrend,
        rsi14: setup.chartTechnicals.rsi14,
        atr14: setup.chartTechnicals.atr14,
        supportLevels: [setup.chartTechnicals.support1, setup.chartTechnicals.support2],
        resistanceLevels: [setup.chartTechnicals.resistance1, setup.chartTechnicals.resistance2],
        chartPattern: setup.chartTechnicals.chartPattern,
        keyObservation: setup.chartTechnicals.keyObservation,
      }
    : tech?.available
      ? {
          timeframe: `5-min candles (${snap?.barsSource ?? "n/a"})`,
          trend: tech.trend,
          ema9: tech.ema9,
          ema21: tech.ema21,
          vwap: tech.vwap,
          supertrendBullish: tech.supertrendBullish,
          rsi14: tech.rsi14,
          supportLevels: [tech.pivotSupport],
          resistanceLevels: [tech.pivotResistance],
        }
      : null;

  const strikesUsable = snap !== null && !snap.isSimulated;
  const clean = a.instrument.replace(/[^A-Z0-9]/g, "");
  const optionStrikes = strikesUsable
    ? snap.rows.map((r) => ({
        strike: r.strike,
        isAtm: r.isAtm,
        call: {
          contract: `${clean} ${r.strike} ${a.market === "GLOBAL_US" ? "CALL" : "CE"}`,
          ltp: r.call.ltp,
          bid: r.call.bid,
          ask: r.call.ask,
          openInterest: r.call.openInterest,
          iv: r.call.impliedVolatility,
        },
        put: {
          contract: `${clean} ${r.strike} ${a.market === "GLOBAL_US" ? "PUT" : "PE"}`,
          ltp: r.put.ltp,
          bid: r.put.bid,
          ask: r.put.ask,
          openInterest: r.put.openInterest,
          iv: r.put.impliedVolatility,
        },
      }))
    : [];

  return {
    ok: true,
    market: a.market === "GLOBAL_US" ? "GLOBAL_INDICES" : "NSE_FNO",
    instrument: a.instrument,
    currency: a.config.currency,
    lotSize: a.config.lotSize,
    spotPrice: a.quote.ok ? a.quote.spotPrice : null,
    change: a.quote.ok ? a.quote.change : null,
    changePct: a.quote.ok ? a.quote.changePct : null,
    quote: {
      available: a.quote.ok,
      source: a.quote.dataSource ?? "unavailable",
      freshness: a.quote.freshnessStatus ?? null,
      asOf: typeof a.quote.asOf === "number" ? new Date(a.quote.asOf).toISOString() : null,
    },
    marketTiming: getMarketTiming(a.market),
    status: result.status,
    reason: result.reason,
    reasons: result.reasons,
    dataQuality: result.dataQuality,
    isSimulated: false,
    setups: setup ? [setup] : [],
    fnoChartAnalysis: chartAnalysis,
    greeksView: setup ? setup.greeks : null,
    geopoliticalAnalysis: a.macro ?? {
      available: false,
      source: "unavailable",
      asOf: null,
      indicators: [],
      summary: "Macro context unavailable.",
    },
    bestProfitTradeSetup: setup
      ? {
          tradeId: setup.tradeId,
          action: setup.action,
          optionType: setup.optionType,
          recommendedContract: setup.contract,
          strategy: setup.strategy,
          spotEntryTrigger: setup.spotEntryTrigger,
          premiumEntryRange: setup.premiumEntryRange,
          entryPrice: setup.entryPrice,
          stopLossPrice: setup.stopLossPrice,
          target1: setup.target1,
          target2: setup.target2,
          target3: setup.target3,
          riskRewardRatio: setup.riskRewardRatio,
          expectedProfitPctT2: setup.expectedProfitPctT2,
          rationale: setup.bestProfitRationale,
          calculation: setup.calculation,
          generatedAt: setup.generatedAt,
        }
      : null,
    optionStrikes,
    ...(strikesUsable
      ? {}
      : { optionStrikesNote: "Option chain unavailable or simulated: no strikes are returned." }),
    timestamp: new Date().toISOString(),
    paperTradingNote:
      "Orders sent to POST /api/v1/trades/order are simulated paper trades; no real order is placed with any broker.",
  };
}
