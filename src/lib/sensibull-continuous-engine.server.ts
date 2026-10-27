/**
 * Continuous F&O Analysis Engine (`sensibullContinuousEngine`)
 *
 * On-demand, Workers-safe replacement for the former `setInterval` daemon.
 *
 * Model
 * - NO timers or side effects at module load. Nothing runs until a caller asks for state.
 * - `getState(instrument)` / `ensureFresh(instrument)` return a cached computation when it is
 *   younger than the TTL (default 1000 ms) and otherwise compute a new one.
 * - Concurrent callers for the same instrument share ONE in-flight computation (single-flight).
 * - The cache is bounded and strictly best-effort: Workers isolates are ephemeral and parallel,
 *   so correctness never depends on cache contents. "Ticks" are computations, not wall-clock loops.
 *
 * Integrity
 * - Every scoring input is derived from real data or marked unavailable. Nothing is defaulted:
 *   no assumed RSI/EMA/VWAP, no assumed spread, no assumed macro sentiment or win rate, and no
 *   default trade direction. See `trade-scoring-service.ts` for how unavailable factors are
 *   excluded, capped and enforced by the hard risk gates.
 * - Closed sessions surface `MARKET_CLOSED` and the candidate service refuses fresh candidates.
 */

import {
  optionsGreeksDataService,
  greeksAnalysisService,
  fnoSignalAnalysisService,
  fnoMarketDataService,
  tradeCandidateService,
  tradingSessionService,
  TtlSingleFlightCache,
  DataUnavailableError,
  type SynchronizedGreeksSnapshot,
  type GreeksAnalysisReport,
  type CombinedFnoAnalysisReport,
  type CandidateGenerationResult,
  type FnoMarketSnapshot,
  type TradingSessionInfo,
  type DataFreshnessStatus as ValidationFreshness,
} from "./services/index.ts";
import {
  calculateTradeScore,
  type TradeScoringResult,
  type TradeScoringInput,
  type FactorDataState,
} from "./trade-scoring-service.ts";
import {
  simulateStrategyScenarios,
  type StrategyScenarioReport,
  type OptionLeg,
} from "./scenario-simulator.ts";
import { getRealizedStrategyPerformance } from "./strategy-backtest.ts";
import { WORKSTATION_INSTRUMENTS } from "./terminal-workstation.functions.ts";

export const DEFAULT_ENGINE_INSTRUMENT = "NIFTY 50";
export const DEFAULT_ENGINE_TTL_MS = 1000;
const MAX_CACHED_INSTRUMENTS = 16;

export type EngineStatus = "STREAMING_ACTIVE" | "MARKET_CLOSED" | "STALE_DATA" | "IDLE" | "ERROR";

export interface EngineDataQuality {
  provider: string | null;
  /** Where the option chain came from. */
  chain: FnoMarketSnapshot["dataSource"] | "UNAVAILABLE";
  /** Where the Greeks surface came from. */
  greeks: SynchronizedGreeksSnapshot["dataSource"] | "UNAVAILABLE";
  technicals: "REAL" | "UNAVAILABLE";
  candles: { source: string; lastBarAt: string | null; error?: string };
  session: { phase: string; isMarketOpen: boolean; text: string } | null;
  freshness: {
    chainStatus: ValidationFreshness | "UNAVAILABLE";
    chainAgeSeconds: number | null;
    candleAgeSeconds: number | null;
  };
  /** Per-factor provenance for the 7-factor score: REAL / UNAVAILABLE / SIMULATED / STALE. */
  factors: Array<{ id: string; name: string; state: FactorDataState }>;
  /** Share (0-1) of the scoring model backed by real data. */
  dataCoverage: number;
  /** Score ceiling applied due to missing data (null when none). */
  scoreCap: number | null;
  notes: string[];
}

export interface BackendContinuousState {
  instrument: string;
  underlyingPrice: number | null;
  timestamp: string;
  /** Epoch ms when this state was computed. */
  computedAtMs: number;
  /** Cache TTL applied by the engine, in ms. */
  ttlMs: number;
  /** Number of computations performed for this instrument in this isolate (alias of metrics.totalTicks). */
  loopCount: number;
  latencyMs: number;
  status: EngineStatus;
  greeksSnapshot: SynchronizedGreeksSnapshot | null;
  greeksAnalysis: GreeksAnalysisReport | null;
  fnoSnapshot: FnoMarketSnapshot | null;
  fnoSignalAnalysis: CombinedFnoAnalysisReport | null;
  tradeScore: TradeScoringResult | null;
  candidates: CandidateGenerationResult | null;
  scenarioAudit: StrategyScenarioReport | null;
  session: TradingSessionInfo | null;
  dataQuality: EngineDataQuality;
  metrics: {
    lastTickDurationMs: number;
    /** Computations performed (each on-demand evaluation counts as one tick). */
    totalTicks: number;
    errorCount: number;
    lastError?: string;
    startedAt: string;
  };
}

/** Injectable collaborators so the engine can be exercised deterministically in tests. */
export interface EngineDependencies {
  getGreeksSnapshot(instrument: string): Promise<SynchronizedGreeksSnapshot>;
  getMarketSnapshot(instrument: string): Promise<FnoMarketSnapshot>;
  getSession(instrument: string, nowMs: number): TradingSessionInfo;
  now(): number;
}

export interface EngineOptions {
  ttlMs?: number;
  maxInstruments?: number;
  accountCapital?: number;
  maxRiskPerTradePct?: number;
  deps?: Partial<EngineDependencies>;
}

const defaultDeps: EngineDependencies = {
  getGreeksSnapshot: (instrument) => optionsGreeksDataService.getGreeksSnapshot(instrument),
  getMarketSnapshot: (instrument) => fnoMarketDataService.getMarketSnapshot(instrument),
  getSession: (instrument, nowMs) =>
    tradingSessionService.getSessionInfo(new Date(nowMs), instrument),
  now: () => Date.now(),
};

interface InstrumentMetrics {
  totalTicks: number;
  errorCount: number;
  lastError?: string;
  lastTickDurationMs: number;
  startedAt: string;
}

function parseTs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

/** Percentage move since the first candle of the latest session day (UTC day of last bar). */
function sessionChangePct(bars: FnoMarketSnapshot["bars"], spot: number): number | undefined {
  if (bars.length === 0) return undefined;
  const lastDay = Math.floor(bars[bars.length - 1].time / 86400);
  const first = bars.find((b) => Math.floor(b.time / 86400) === lastDay);
  if (!first || !(first.open > 0)) return undefined;
  return +(((spot - first.open) / first.open) * 100).toFixed(2);
}

export class SensibullContinuousEngine {
  private readonly cache: TtlSingleFlightCache<BackendContinuousState>;
  private readonly metrics = new Map<string, InstrumentMetrics>();
  private readonly deps: EngineDependencies;
  private readonly ttlMs: number;
  private readonly maxInstruments: number;
  private readonly accountCapital: number;
  private readonly maxRiskPerTradePct: number;

  constructor(opts: EngineOptions = {}) {
    this.deps = { ...defaultDeps, ...(opts.deps ?? {}) };
    this.ttlMs = Math.max(0, opts.ttlMs ?? DEFAULT_ENGINE_TTL_MS);
    this.maxInstruments = Math.max(1, opts.maxInstruments ?? MAX_CACHED_INSTRUMENTS);
    this.accountCapital = opts.accountCapital ?? 30000;
    this.maxRiskPerTradePct = opts.maxRiskPerTradePct ?? 2.0;
    this.cache = new TtlSingleFlightCache<BackendContinuousState>({
      ttlMs: this.ttlMs,
      maxEntries: this.maxInstruments,
      now: () => this.deps.now(),
    });
  }

  /** Number of full computations actually executed (cache hits and shared flights excluded). */
  public get computationCount(): number {
    return this.cache.computeCount;
  }

  public get cachedInstrumentCount(): number {
    return this.cache.size;
  }

  public get ttl(): number {
    return this.ttlMs;
  }

  /**
   * Return the engine state for an instrument, computing it on demand when the cached copy is
   * older than the TTL. Concurrent callers share one computation.
   */
  public async getState(
    instrument: string = DEFAULT_ENGINE_INSTRUMENT,
    opts: { forceRefresh?: boolean } = {},
  ): Promise<BackendContinuousState> {
    return this.cache.getOrCompute(instrument, () => this.computeState(instrument), {
      forceRefresh: opts.forceRefresh,
    });
  }

  /** Alias of `getState`, named for call sites that only care about freshness. */
  public ensureFresh(
    instrument: string = DEFAULT_ENGINE_INSTRUMENT,
  ): Promise<BackendContinuousState> {
    return this.getState(instrument);
  }

  /**
   * Last cached state without triggering any computation (may be stale). Returns an IDLE state
   * when nothing has been computed for the instrument in this isolate.
   */
  public getLatestState(instrument: string = DEFAULT_ENGINE_INSTRUMENT): BackendContinuousState {
    const hit = this.cache.peek(instrument);
    return hit ? hit.value : this.idleState(instrument);
  }

  /** Perform one uncached computation (kept for backward compatibility with the old daemon API). */
  public executeAnalysisTick(instrument: string): Promise<BackendContinuousState> {
    return this.getState(instrument, { forceRefresh: true });
  }

  // ---------------------------------------------------------------------------------------------

  private metricsFor(instrument: string): InstrumentMetrics {
    let m = this.metrics.get(instrument);
    if (!m) {
      m = {
        totalTicks: 0,
        errorCount: 0,
        lastTickDurationMs: 0,
        startedAt: new Date(this.deps.now()).toISOString(),
      };
      // Bound the metrics map (instrument keys are allow-listed, but never trust that here).
      if (this.metrics.size >= this.maxInstruments) {
        const oldest = this.metrics.keys().next().value;
        if (oldest !== undefined) this.metrics.delete(oldest);
      }
      this.metrics.set(instrument, m);
    }
    return m;
  }

  private emptyQuality(notes: string[], session: TradingSessionInfo | null): EngineDataQuality {
    return {
      provider: null,
      chain: "UNAVAILABLE",
      greeks: "UNAVAILABLE",
      technicals: "UNAVAILABLE",
      candles: { source: "UNAVAILABLE", lastBarAt: null },
      session: session
        ? { phase: session.phase, isMarketOpen: session.isMarketOpen, text: session.sessionText }
        : null,
      freshness: { chainStatus: "UNAVAILABLE", chainAgeSeconds: null, candleAgeSeconds: null },
      factors: [],
      dataCoverage: 0,
      scoreCap: null,
      notes,
    };
  }

  private baseState(
    instrument: string,
    status: EngineStatus,
    quality: EngineDataQuality,
  ): BackendContinuousState {
    const m = this.metricsFor(instrument);
    const nowMs = this.deps.now();
    return {
      instrument,
      underlyingPrice: null,
      timestamp: new Date(nowMs).toISOString(),
      computedAtMs: nowMs,
      ttlMs: this.ttlMs,
      loopCount: m.totalTicks,
      latencyMs: m.lastTickDurationMs,
      status,
      greeksSnapshot: null,
      greeksAnalysis: null,
      fnoSnapshot: null,
      fnoSignalAnalysis: null,
      tradeScore: null,
      candidates: null,
      scenarioAudit: null,
      session: null,
      dataQuality: quality,
      metrics: {
        lastTickDurationMs: m.lastTickDurationMs,
        totalTicks: m.totalTicks,
        errorCount: m.errorCount,
        lastError: m.lastError,
        startedAt: m.startedAt,
      },
    };
  }

  private idleState(instrument: string): BackendContinuousState {
    return this.baseState(
      instrument,
      "IDLE",
      this.emptyQuality(["No computation has run for this instrument in this isolate yet."], null),
    );
  }

  /**
   * One full evaluation cycle. Never throws: failures become an ERROR state (and are cached for
   * the TTL, so a failing upstream is not hammered).
   */
  private async computeState(instrument: string): Promise<BackendContinuousState> {
    const t0 = this.deps.now();
    const m = this.metricsFor(instrument);
    m.totalTicks++;
    try {
      const state = await this.evaluate(instrument, t0);
      m.lastTickDurationMs = this.deps.now() - t0;
      state.latencyMs = m.lastTickDurationMs;
      state.metrics.lastTickDurationMs = m.lastTickDurationMs;
      return state;
    } catch (err) {
      m.errorCount++;
      m.lastError = err instanceof Error ? err.message : String(err);
      m.lastTickDurationMs = this.deps.now() - t0;
      console.warn(`[SensibullContinuousEngine] ${instrument}: ${m.lastError}`);
      const session = (() => {
        try {
          return this.deps.getSession(instrument, t0);
        } catch {
          return null;
        }
      })();
      const state = this.baseState(
        instrument,
        "ERROR",
        this.emptyQuality(
          [
            `Computation failed: ${m.lastError}`,
            ...(err instanceof DataUnavailableError ? err.notes.slice(0, 5) : []),
          ],
          session,
        ),
      );
      state.session = session;
      return state;
    }
  }

  private async evaluate(instrument: string, t0: number): Promise<BackendContinuousState> {
    const cfg = WORKSTATION_INSTRUMENTS[instrument];
    if (!cfg) throw new Error(`Unknown instrument: ${instrument}`);
    const lotSize = cfg.lotSize;

    const session = this.deps.getSession(instrument, t0);

    // 1. Real data: Greeks snapshot and F&O snapshot (option chain + real candles)
    const [greeksSnapshot, fnoSnapshot] = await Promise.all([
      this.deps.getGreeksSnapshot(instrument),
      this.deps.getMarketSnapshot(instrument),
    ]);
    const spot = fnoSnapshot.underlyingPrice;

    // 2. Greeks analysis + combined signal
    const greeksAnalysis = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
    const fnoSignalAnalysis = fnoSignalAnalysisService.analyzeCombinedSignal(
      fnoSnapshot,
      greeksAnalysis,
    );

    // 3. Trade candidates + hard risk gates (refuses on closed session / simulated / missing data)
    const candidates = tradeCandidateService.evaluateCandidates(
      fnoSnapshot,
      greeksAnalysis,
      fnoSignalAnalysis,
      this.accountCapital,
      this.maxRiskPerTradePct,
    );

    // 4. 7-factor scoring from REAL inputs only (anything missing is left undefined)
    const bias = fnoSignalAnalysis.marketBias;
    const intendedDirection: TradeScoringInput["intendedDirection"] = bias.includes("BULLISH")
      ? "CALL"
      : bias.includes("BEARISH")
        ? "PUT"
        : "NEUTRAL";
    const optionSide: "CALL" | "PUT" = intendedDirection === "PUT" ? "PUT" : "CALL";

    const tech = fnoSignalAnalysis.technical;
    const technical: TradeScoringInput["technical"] =
      tech.available && tech.rsi14 !== null && tech.ema9 !== null && tech.ema21 !== null
        ? {
            rsi: tech.rsi14,
            ema9: tech.ema9,
            ema21: tech.ema21,
            vwap: tech.vwap ?? undefined,
            supertrendBullish: tech.supertrendBullish ?? undefined,
            dataTimestamp: tech.dataTimestamp ?? undefined,
          }
        : undefined;

    const atmPoint =
      greeksSnapshot.points.find((p) => p.isAtm) ??
      greeksSnapshot.points[Math.floor(greeksSnapshot.points.length / 2)];
    const greeksTs = parseTs(greeksSnapshot.timestamp);
    const scoringGreeks: TradeScoringInput["greeks"] = atmPoint
      ? {
          delta: optionSide === "PUT" ? atmPoint.putDelta : atmPoint.callDelta,
          gamma: optionSide === "PUT" ? atmPoint.putGamma : atmPoint.callGamma,
          thetaPerDay: optionSide === "PUT" ? atmPoint.putTheta : atmPoint.callTheta,
          vegaPerPoint: optionSide === "PUT" ? atmPoint.putVega : atmPoint.callVega,
          // Provider IV is in percent; the scorer expects a fraction.
          iv: (optionSide === "PUT" ? atmPoint.putIv : atmPoint.callIv) / 100,
          daysToExpiry: greeksSnapshot.daysToExpiry,
          strike: atmPoint.strike,
          isAtm: atmPoint.isAtm,
          dataTimestamp: greeksTs,
          simulated: greeksSnapshot.isSimulated,
          stale: greeksSnapshot.freshnessStatus === "STALE",
        }
      : undefined;

    const chainTs = parseTs(fnoSnapshot.chainTimestamp);
    const chainStale = fnoSnapshot.validation.freshnessStatus === "STALE";
    const openInterest: TradeScoringInput["openInterest"] = {
      pcr: fnoSnapshot.pcr,
      maxPainStrike: fnoSnapshot.maxPainStrike,
      callOiChangeTotal: fnoSignalAnalysis.positioning.callOiChangeTotal,
      putOiChangeTotal: fnoSignalAnalysis.positioning.putOiChangeTotal,
      dataTimestamp: chainTs,
      simulated: fnoSnapshot.isSimulated,
      stale: chainStale,
    };

    // Liquidity from the actual bid/ask of the option on the intended side at the ATM strike.
    const atmRow =
      fnoSnapshot.rows.find((r) => r.strike === fnoSnapshot.atmStrike) ??
      fnoSnapshot.rows.find((r) => r.isAtm);
    const quoteLeg = optionSide === "PUT" ? atmRow?.put : atmRow?.call;
    let liquidity: TradeScoringInput["liquidity"];
    if (
      quoteLeg &&
      typeof quoteLeg.bid === "number" &&
      typeof quoteLeg.ask === "number" &&
      quoteLeg.bid > 0 &&
      quoteLeg.ask >= quoteLeg.bid
    ) {
      const mid = (quoteLeg.bid + quoteLeg.ask) / 2;
      liquidity = {
        bidAskSpreadPct: +(((quoteLeg.ask - quoteLeg.bid) / mid) * 100).toFixed(3),
        avgLotVolume: quoteLeg.volume,
        dataTimestamp: chainTs,
        simulated: fnoSnapshot.isSimulated,
        stale: chainStale,
      };
    }

    // Macro sentiment: market-news-service provides headlines but no numeric sentiment score
    // (and falls back to static baseline items), so it is not a usable scoring input. Left
    // unavailable rather than assumed.
    const macroSentiment: TradeScoringInput["macroSentiment"] = undefined;

    // Strategy performance: only real, verified statistics are accepted.
    const realized = getRealizedStrategyPerformance(instrument);
    const performance: TradeScoringInput["performance"] = realized.available
      ? {
          winRatePct: realized.winRatePct,
          profitFactor: realized.profitFactor,
          sampleSignalsCount: realized.sampleSignalsCount,
        }
      : undefined;

    const tradeScore = calculateTradeScore({
      instrument,
      spotPrice: spot,
      changePct: sessionChangePct(fnoSnapshot.bars, spot),
      intendedDirection,
      technical,
      greeks: scoringGreeks,
      openInterest,
      macroSentiment,
      liquidity,
      performance,
      session: {
        isMarketOpen: session.isMarketOpen,
        canGenerateFreshCandidates: session.canGenerateFreshCandidates,
        phase: session.phase,
      },
    });

    // 5. Stress scenarios on a sample ATM long call, only when real ATM pricing exists
    let scenarioAudit: StrategyScenarioReport | null = null;
    if (atmPoint && atmPoint.callLtp > 0 && atmPoint.callIv > 0) {
      const sampleLegs: OptionLeg[] = [
        {
          id: `backend-atm-ce-${atmPoint.strike}`,
          strike: atmPoint.strike,
          type: "CE",
          action: "BUY",
          quantity: lotSize,
          entryPrice: atmPoint.callLtp,
          currentPrice: atmPoint.callLtp,
          iv: atmPoint.callIv,
        },
      ];
      scenarioAudit = simulateStrategyScenarios(
        `${instrument} Continuous ATM Greek Simulation`,
        sampleLegs,
        spot,
        greeksSnapshot.daysToExpiry,
        lotSize,
        undefined,
        0.068, // model assumption: risk-free rate
        0.012, // model assumption: dividend yield
      );
    }

    // 6. Status + data quality
    const validation = fnoSnapshot.validation;
    let status: EngineStatus = "STREAMING_ACTIVE";
    if (!session.isMarketOpen) status = "MARKET_CLOSED";
    else if (
      !validation.isValid ||
      validation.freshnessStatus === "STALE" ||
      greeksSnapshot.freshnessStatus === "STALE"
    ) {
      status = "STALE_DATA";
    }

    const notes: string[] = [];
    if (fnoSnapshot.isSimulated) {
      notes.push("Option chain is a simulated baseline (no live broker feed): not tradeable data.");
    }
    if (greeksSnapshot.isSimulated) {
      notes.push("Greeks are computed locally (Black-Scholes), not a live feed.");
    }
    if (!tech.available) notes.push(`Technicals unavailable: ${tech.unavailableReason}`);
    if (!liquidity) notes.push("Real bid/ask unavailable for the ATM option.");
    notes.push("Macro sentiment unavailable: no numeric sentiment source.");
    if (!realized.available) notes.push(`Strategy performance unavailable: ${realized.reason}`);
    if (!session.isMarketOpen) notes.push(`Session closed: ${session.sessionText}`);

    const dataQuality: EngineDataQuality = {
      provider: fnoSnapshot.provider,
      chain: fnoSnapshot.dataSource,
      greeks: greeksSnapshot.dataSource,
      technicals: tech.available ? "REAL" : "UNAVAILABLE",
      candles: {
        source: fnoSnapshot.barsSource,
        lastBarAt: fnoSnapshot.barsLastAt,
        error: fnoSnapshot.barsError,
      },
      session: {
        phase: session.phase,
        isMarketOpen: session.isMarketOpen,
        text: session.sessionText,
      },
      freshness: {
        chainStatus: validation.freshnessStatus,
        chainAgeSeconds: validation.ageSeconds,
        candleAgeSeconds:
          tech.dataTimestamp !== null
            ? Math.max(0, Math.round((t0 - tech.dataTimestamp) / 1000))
            : null,
      },
      factors: tradeScore.factorDataQuality,
      dataCoverage: tradeScore.dataCoverage,
      scoreCap: tradeScore.scoreCap,
      notes,
    };

    const m = this.metricsFor(instrument);
    const nowMs = this.deps.now();
    return {
      instrument,
      underlyingPrice: spot,
      timestamp: new Date(nowMs).toISOString(),
      computedAtMs: nowMs,
      ttlMs: this.ttlMs,
      loopCount: m.totalTicks,
      latencyMs: nowMs - t0,
      status,
      greeksSnapshot,
      greeksAnalysis,
      fnoSnapshot,
      fnoSignalAnalysis,
      tradeScore,
      candidates,
      scenarioAudit,
      session,
      dataQuality,
      metrics: {
        lastTickDurationMs: nowMs - t0,
        totalTicks: m.totalTicks,
        errorCount: m.errorCount,
        lastError: m.lastError,
        startedAt: m.startedAt,
      },
    };
  }
}

/** Factory for isolated engines (tests, or callers that need a different TTL). */
export function createContinuousEngine(opts: EngineOptions = {}): SensibullContinuousEngine {
  return new SensibullContinuousEngine(opts);
}

/**
 * Shared engine instance. Construction only allocates empty maps: there are no timers, no I/O
 * and no background work until `getState()` is called from a request.
 */
export const sensibullContinuousEngine = new SensibullContinuousEngine();
