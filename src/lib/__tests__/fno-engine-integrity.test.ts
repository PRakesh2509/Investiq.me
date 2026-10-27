import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  TtlSingleFlightCache,
  tradeCandidateService,
  computeTechnicalSnapshot,
  fnoSignalAnalysisService,
  greeksAnalysisService,
  type FnoMarketSnapshot,
  type SynchronizedGreeksSnapshot,
} from "../services/index.ts";
import {
  parseExpiryParam,
  parseInstrumentParam,
  parseNumberParam,
} from "../services/fnoApiHelpers.ts";
import { calculateTradeScore, type TradeScoringInput } from "../trade-scoring-service.ts";
import { createContinuousEngine } from "../sensibull-continuous-engine.server.ts";
import { makeGreeksSnapshot, makeSnapshot, makeUptrendBars } from "./fixtures/fno-fixtures.ts";

// Wednesday 2026-10-21 11:00 IST (market open) and Saturday 2026-10-24 11:00 IST (closed).
const OPEN_MS = Date.parse("2026-10-21T05:30:00.000Z");
const WEEKEND_MS = Date.parse("2026-10-24T05:30:00.000Z");

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("TtlSingleFlightCache", () => {
  test("serves cached values within the TTL and recomputes after it expires", async () => {
    let t = 1_000;
    const cache = new TtlSingleFlightCache<number>({ ttlMs: 1000, maxEntries: 4, now: () => t });
    let n = 0;
    const compute = async () => ++n;

    assert.equal(await cache.getOrCompute("a", compute), 1);
    t += 999;
    assert.equal(await cache.getOrCompute("a", compute), 1, "still fresh at 999ms");
    t += 1;
    assert.equal(await cache.getOrCompute("a", compute), 2, "expired at 1000ms");
    assert.equal(cache.computeCount, 2);
  });

  test("single-flight: concurrent callers share one computation", async () => {
    const cache = new TtlSingleFlightCache<string>({ ttlMs: 1000, maxEntries: 4 });
    const gate = deferred<string>();
    let calls = 0;
    const compute = () => {
      calls++;
      return gate.promise;
    };

    const callers = Array.from({ length: 10 }, () => cache.getOrCompute("k", compute));
    assert.equal(cache.inflightCount, 1);
    gate.resolve("shared");
    const results = await Promise.all(callers);

    assert.equal(calls, 1);
    assert.deepEqual(new Set(results), new Set(["shared"]));
    assert.equal(cache.inflightCount, 0);
  });

  test("failures are shared by concurrent callers but never cached", async () => {
    const cache = new TtlSingleFlightCache<number>({ ttlMs: 1000, maxEntries: 4 });
    const gate = deferred<number>();
    let calls = 0;
    const failing = () => {
      calls++;
      return gate.promise;
    };

    const a = cache.getOrCompute("k", failing);
    const b = cache.getOrCompute("k", failing);
    gate.reject(new Error("boom"));
    await assert.rejects(a, /boom/);
    await assert.rejects(b, /boom/);
    assert.equal(calls, 1);

    assert.equal(await cache.getOrCompute("k", async () => 42), 42, "next call recomputes");
    assert.equal(cache.computeCount, 2);
  });

  test("is bounded: oldest entries are evicted beyond maxEntries", () => {
    const cache = new TtlSingleFlightCache<number>({ ttlMs: 1000, maxEntries: 3 });
    for (let i = 0; i < 6; i++) cache.set(`k${i}`, i);
    assert.equal(cache.size, 3);
    assert.equal(cache.peek("k0"), undefined);
    assert.equal(cache.peek("k5")?.value, 5);
  });

  test("an abandoned in-flight computation is replaced once it is too old", async () => {
    let t = 0;
    const cache = new TtlSingleFlightCache<string>({
      ttlMs: 1000,
      maxEntries: 4,
      maxInflightAgeMs: 5000,
      now: () => t,
    });
    // Leader that never settles (e.g. its request was cancelled).
    void cache.getOrCompute("k", () => new Promise<string>(() => {}));
    t = 6000;
    assert.equal(await cache.getOrCompute("k", async () => "recovered"), "recovered");
  });
});

describe("Trade scoring: missing / simulated data gating", () => {
  const nowMs = Date.now();
  const fullInput = (): TradeScoringInput => ({
    instrument: "NIFTY 50",
    spotPrice: 22862.9,
    intendedDirection: "CALL",
    technical: { rsi: 61, ema9: 22840, ema21: 22800, vwap: 22810, dataTimestamp: nowMs },
    greeks: {
      delta: 0.52,
      gamma: 0.0018,
      thetaPerDay: -14,
      iv: 0.142,
      daysToExpiry: 4.5,
      dataTimestamp: nowMs,
    },
    openInterest: { pcr: 1.28, maxPainStrike: 22800, dataTimestamp: nowMs },
    macroSentiment: { sentimentScore: 0.3, highImpactEventsCount: 0, dataTimestamp: nowMs },
    liquidity: { bidAskSpreadPct: 0.3, dataTimestamp: nowMs },
    performance: { winRatePct: 70, profitFactor: 1.9, sampleSignalsCount: 52 },
  });

  test("with no inputs every factor is unavailable, score is zero and the hard gates FAIL", () => {
    const res = calculateTradeScore({
      instrument: "NIFTY 50",
      spotPrice: 22862.9,
      intendedDirection: "CALL",
    });

    assert.ok(res.factorBreakdown.every((f) => !f.available && f.score === 0));
    assert.ok(res.factorBreakdown.every((f) => f.weightedContribution === 0));
    assert.equal(res.overallScore, 0);
    assert.equal(res.dataCoverage, 0);
    assert.notEqual(res.scoreCap, null);
    assert.equal(res.dataQuality, "INSUFFICIENT_DATA");
    assert.equal(res.allHardRiskPassed, false);
    const integrity = res.riskChecks.find((c) => c.id === "risk_data_integrity");
    assert.equal(integrity?.passed, false);
    assert.equal(integrity?.severity, "CRITICAL");
    assert.equal(res.riskChecks.find((c) => c.id === "risk_spread")?.passed, false);
    assert.equal(res.riskChecks.find((c) => c.id === "risk_gamma")?.passed, false);
    assert.ok(res.factorDataQuality.every((f) => f.state === "UNAVAILABLE"));
    assert.equal(res.marketBias, "NEUTRAL");
  });

  test("partial data: unavailable factors add nothing, the score is capped and gates fail", () => {
    const input = fullInput();
    delete input.liquidity;
    delete input.macroSentiment;
    delete input.performance;

    const res = calculateTradeScore(input);

    const unavailable = res.factorBreakdown.filter((f) => !f.available).map((f) => f.id);
    assert.deepEqual(unavailable.sort(), ["liquidity", "macro", "performance"]);
    for (const f of res.factorBreakdown.filter((x) => !x.available)) {
      assert.equal(f.score, 0, `${f.id} must not carry a substituted score`);
      assert.equal(f.weightedContribution, 0);
      assert.equal(f.status, "MISSING_DATA");
    }
    assert.ok(res.dataCoverage < 1 && res.dataCoverage > 0);
    assert.notEqual(res.scoreCap, null);
    assert.ok(res.overallScore <= (res.scoreCap as number));
    assert.equal(res.allHardRiskPassed, false, "missing liquidity must fail the hard gates");
    assert.ok(res.confidenceLevel < 70);
    assert.ok(res.explanation.includes("capped"));
  });

  test("macro/performance only missing: score is capped but execution gates still pass", () => {
    const input = fullInput();
    delete input.macroSentiment;
    delete input.performance;

    const res = calculateTradeScore(input);

    assert.ok(res.scoreCap !== null && res.scoreCap < 100);
    assert.ok(res.overallScore <= (res.scoreCap as number));
    assert.equal(res.allHardRiskPassed, true);
    assert.equal(res.dataQuality, "PARTIAL_INPUTS");
  });

  test("simulated sections are excluded from the score and fail the data-integrity gate", () => {
    const input = fullInput();
    input.openInterest = { ...input.openInterest, simulated: true };
    input.liquidity = { ...input.liquidity, simulated: true };
    input.greeks = { ...input.greeks, simulated: true };

    const res = calculateTradeScore(input);

    const states = Object.fromEntries(res.factorDataQuality.map((f) => [f.id, f.state]));
    assert.equal(states.oi, "SIMULATED");
    assert.equal(states.liquidity, "SIMULATED");
    assert.equal(states.greeks, "SIMULATED");
    assert.equal(states.iv, "SIMULATED");
    assert.equal(states.tech, "REAL");
    assert.equal(res.allHardRiskPassed, false);
    assert.equal(res.riskChecks.find((c) => c.id === "risk_data_integrity")?.passed, false);
  });

  test("stale technical data fails the integrity gate", () => {
    const input = fullInput();
    input.technical = { ...input.technical, dataTimestamp: nowMs - 60 * 60 * 1000 };
    const res = calculateTradeScore(input);
    assert.equal(res.factorBreakdown.find((f) => f.id === "tech")?.status, "STALE");
    assert.equal(res.riskChecks.find((c) => c.id === "risk_data_integrity")?.passed, false);
    assert.equal(res.allHardRiskPassed, false);
  });

  test("complete real inputs pass every gate without a cap", () => {
    const res = calculateTradeScore(fullInput());
    assert.equal(res.scoreCap, null);
    assert.equal(res.dataCoverage, 1);
    assert.equal(res.allHardRiskPassed, true);
    assert.equal(res.dataQuality, "LIVE_VERIFIED");
  });

  test("a closed session fails the gates even with complete data", () => {
    const res = calculateTradeScore({
      ...fullInput(),
      session: { isMarketOpen: false, canGenerateFreshCandidates: false, phase: "WEEKEND" },
    });
    assert.equal(res.riskChecks.find((c) => c.id === "risk_session")?.passed, false);
    assert.equal(res.allHardRiskPassed, false);
  });
});

describe("Signal analysis without fabricated technicals", () => {
  test("too few real candles => technicals unavailable and confluence capped neutral", () => {
    const snap = makeSnapshot({ nowMs: OPEN_MS, bars: makeUptrendBars(10, OPEN_MS) });
    const report = fnoSignalAnalysisService.analyzeCombinedSignal(
      snap,
      greeksAnalysisService.analyzeGreeks(makeGreeksSnapshot(snap)),
    );
    assert.equal(report.technical.available, false);
    assert.equal(report.technical.rsi14, null);
    assert.equal(report.technical.ema9, null);
    assert.equal(report.positioning.oiBuildup, "UNAVAILABLE");
    assert.ok(report.confluenceScore >= 41 && report.confluenceScore <= 59);
    assert.equal(report.marketBias, "NEUTRAL_RANGEBOUND");
    assert.equal(report.dataQuality.technical, "UNAVAILABLE");
  });

  test("real candles produce real indicators", () => {
    const t = computeTechnicalSnapshot(makeUptrendBars(80, OPEN_MS), 22958);
    assert.equal(t.available, true);
    assert.ok(t.rsi14 !== null && t.rsi14 > 50);
    assert.ok(t.ema9 !== null && t.ema21 !== null && t.ema9 > t.ema21);
    assert.equal(t.emaCross, "BULLISH_STACK");
    assert.equal(t.dataTimestamp, Math.floor(OPEN_MS / 1000) * 1000);
  });
});

describe("Continuous engine (on-demand, TTL cache, single-flight)", () => {
  beforeEach(() => {
    tradeCandidateService.reset();
    mock.timers.enable({ apis: ["Date"], now: OPEN_MS });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  function buildEngine(
    overrides: {
      simulated?: boolean;
      bars?: FnoMarketSnapshot["bars"];
      atmQuote?: { bid: number | null; ask: number | null };
      greeksSimulated?: boolean;
      ttlMs?: number;
      maxInstruments?: number;
    } = {},
  ) {
    const counts = { market: 0, greeks: 0 };
    const gates = { market: deferred<void>(), open: false };
    const engine = createContinuousEngine({
      ttlMs: overrides.ttlMs ?? 1000,
      maxInstruments: overrides.maxInstruments,
      deps: {
        now: () => Date.now(),
        getMarketSnapshot: async (instrument): Promise<FnoMarketSnapshot> => {
          counts.market++;
          if (gates.open) await gates.market.promise;
          return {
            ...makeSnapshot({
              nowMs: Date.now(),
              simulated: overrides.simulated,
              bars: overrides.bars,
              atmQuote: overrides.atmQuote,
            }),
            instrument,
          };
        },
        getGreeksSnapshot: async (instrument): Promise<SynchronizedGreeksSnapshot> => {
          counts.greeks++;
          const snap = makeSnapshot({ nowMs: Date.now(), bars: overrides.bars });
          return {
            ...makeGreeksSnapshot(snap, { simulated: overrides.greeksSimulated }),
            instrument,
          };
        },
      },
    });
    return { engine, counts, gates };
  }

  test("does not compute anything until asked (no timers / module-load work)", () => {
    const { engine, counts } = buildEngine();
    assert.equal(counts.market, 0);
    assert.equal(engine.computationCount, 0);
    assert.equal(engine.getLatestState("NIFTY 50").status, "IDLE");
  });

  test("serves a fresh cached state within the TTL and recomputes after it", async () => {
    const { engine, counts } = buildEngine({ ttlMs: 1000 });

    const first = await engine.getState("NIFTY 50");
    mock.timers.tick(999);
    const second = await engine.ensureFresh("NIFTY 50");
    assert.equal(second, first, "same cached object inside the TTL");
    assert.equal(counts.market, 1);

    mock.timers.tick(2);
    const third = await engine.getState("NIFTY 50");
    assert.notEqual(third, first);
    assert.equal(counts.market, 2);
    assert.equal(third.metrics.totalTicks, 2, "ticks count computations");
    assert.equal(third.loopCount, 2);
  });

  test("single-flight: concurrent callers share one computation", async () => {
    const { engine, counts, gates } = buildEngine();
    gates.open = true;

    const calls = Array.from({ length: 8 }, () => engine.getState("NIFTY 50"));
    await new Promise((r) => setImmediate(r));
    gates.market.resolve();
    const states = await Promise.all(calls);

    assert.equal(counts.market, 1);
    assert.equal(counts.greeks, 1);
    assert.equal(engine.computationCount, 1);
    assert.ok(states.every((s) => s === states[0]));
  });

  test("the cache is bounded per instrument count", async () => {
    const { engine } = buildEngine({ maxInstruments: 2 });
    await engine.getState("NIFTY 50");
    await engine.getState("BANK NIFTY");
    await engine.getState("FIN NIFTY");
    assert.equal(engine.cachedInstrumentCount, 2);
  });

  test("an upstream failure becomes an ERROR state that is cached for the TTL", async () => {
    let calls = 0;
    const engine = createContinuousEngine({
      ttlMs: 1000,
      deps: {
        now: () => Date.now(),
        getMarketSnapshot: async () => {
          calls++;
          throw new Error("provider down");
        },
        getGreeksSnapshot: async () => {
          throw new Error("provider down");
        },
      },
    });

    const a = await engine.getState("NIFTY 50");
    const b = await engine.getState("NIFTY 50");
    assert.equal(a.status, "ERROR");
    assert.equal(b, a);
    assert.equal(calls, 1);
    assert.equal(a.metrics.errorCount, 1);
    assert.match(a.metrics.lastError ?? "", /provider down/);
    assert.equal(a.tradeScore, null);
    assert.equal(a.underlyingPrice, null);
  });

  test("live data in an open session: real inputs, passing gates and a candidate", async () => {
    const { engine } = buildEngine();
    const s = await engine.getState("NIFTY 50");

    assert.equal(s.status, "STREAMING_ACTIVE");
    assert.equal(s.dataQuality.technicals, "REAL");
    assert.equal(s.dataQuality.chain, "LIVE_BROKER");
    assert.equal(s.dataQuality.greeks, "LIVE_SENSIBULL");

    const states = Object.fromEntries(s.dataQuality.factors.map((f) => [f.id, f.state]));
    assert.equal(states.tech, "REAL");
    assert.equal(states.greeks, "REAL");
    assert.equal(states.iv, "REAL");
    assert.equal(states.oi, "REAL");
    assert.equal(states.liquidity, "REAL");
    // No usable source exists for these, so they must be unavailable (never defaulted).
    assert.equal(states.macro, "UNAVAILABLE");
    assert.equal(states.performance, "UNAVAILABLE");

    const score = s.tradeScore;
    assert.ok(score);
    assert.ok(score.scoreCap !== null && score.overallScore <= score.scoreCap);
    assert.equal(score.allHardRiskPassed, true);
    const liquidity = score.factorBreakdown.find((f) => f.id === "liquidity");
    assert.match(
      liquidity?.evidence ?? "",
      /0\.50%/,
      "spread comes from the real bid/ask (0.2/40)",
    );

    assert.equal(s.candidates?.noTradeDecision, undefined);
    assert.equal(s.candidates?.activeCandidates.length, 1);
    assert.equal(s.candidates?.activeCandidates[0].callPut, "CE");
    assert.equal(s.candidates?.activeCandidates[0].dataProvenance.optionChain, "LIVE_BROKER");
  });

  test("closed session: MARKET_CLOSED status, no fresh candidates, gates fail", async () => {
    mock.timers.setTime(WEEKEND_MS);
    const { engine } = buildEngine();
    const s = await engine.getState("NIFTY 50");

    assert.equal(s.status, "MARKET_CLOSED");
    assert.equal(s.session?.phase, "WEEKEND");
    assert.equal(s.candidates?.activeCandidates.length, 0);
    assert.equal(s.candidates?.noTradeDecision?.reasonCode, "MARKET_CLOSED");
    assert.equal(s.tradeScore?.allHardRiskPassed, false);
    assert.equal(s.tradeScore?.riskChecks.find((c) => c.id === "risk_session")?.passed, false);
    assert.ok(s.dataQuality.notes.some((n) => n.startsWith("Session closed")));
  });

  test("simulated option chain/Greeks never yield a candidate or passing gates", async () => {
    const { engine } = buildEngine({ simulated: true, greeksSimulated: true });
    const s = await engine.getState("NIFTY 50");

    assert.equal(s.dataQuality.chain, "SIMULATED_BASELINE");
    assert.equal(s.dataQuality.greeks, "SIMULATED_BLACK_SCHOLES");
    assert.equal(s.candidates?.activeCandidates.length, 0);
    assert.equal(s.candidates?.noTradeDecision?.reasonCode, "DATA_STALE_OR_INSUFFICIENT");
    assert.equal(s.tradeScore?.allHardRiskPassed, false);
    const states = Object.fromEntries(s.dataQuality.factors.map((f) => [f.id, f.state]));
    assert.equal(states.oi, "SIMULATED");
    assert.equal(states.liquidity, "SIMULATED");
    assert.equal(states.greeks, "SIMULATED");
    assert.equal(states.tech, "REAL");
  });

  test("no real candles: technicals unavailable, nothing substituted, no candidate", async () => {
    const { engine } = buildEngine({ bars: [] });
    const s = await engine.getState("NIFTY 50");

    assert.equal(s.dataQuality.technicals, "UNAVAILABLE");
    assert.equal(s.fnoSignalAnalysis?.technical.available, false);
    const tech = s.tradeScore?.factorBreakdown.find((f) => f.id === "tech");
    assert.equal(tech?.available, false);
    assert.equal(tech?.score, 0);
    assert.equal(s.tradeScore?.allHardRiskPassed, false);
    assert.equal(s.candidates?.activeCandidates.length, 0);
    assert.equal(s.candidates?.noTradeDecision?.reasonCode, "DATA_STALE_OR_INSUFFICIENT");
  });

  test("missing bid/ask: liquidity unavailable, gates fail, no candidate", async () => {
    const { engine } = buildEngine({ atmQuote: { bid: null, ask: null } });
    const s = await engine.getState("NIFTY 50");

    const liq = s.tradeScore?.factorBreakdown.find((f) => f.id === "liquidity");
    assert.equal(liq?.available, false);
    assert.equal(s.tradeScore?.allHardRiskPassed, false);
    assert.equal(s.candidates?.activeCandidates.length, 0);
    assert.ok(s.candidates?.noTradeDecision);
  });
});

describe("API parameter validation", () => {
  test("instrument must be on the allow-list (aliases normalised, junk rejected)", () => {
    assert.deepEqual(parseInstrumentParam(null), { ok: true, value: "NIFTY 50" });
    assert.deepEqual(parseInstrumentParam("nifty50"), { ok: true, value: "NIFTY 50" });
    assert.deepEqual(parseInstrumentParam("Bank Nifty"), { ok: true, value: "BANK NIFTY" });
    assert.deepEqual(parseInstrumentParam("S&P 500"), { ok: true, value: "S&P 500" });
    assert.equal(parseInstrumentParam("DROP TABLE").ok, false);
    assert.equal(parseInstrumentParam("__proto__").ok, false);
    assert.equal(parseInstrumentParam("x".repeat(500)).ok, false);
  });

  test("expiry must be a real ISO date", () => {
    assert.deepEqual(parseExpiryParam(null), { ok: true, value: undefined });
    assert.deepEqual(parseExpiryParam("2026-10-29"), { ok: true, value: "2026-10-29" });
    assert.equal(parseExpiryParam("2026-13-40").ok, false);
    assert.equal(parseExpiryParam("tomorrow").ok, false);
  });

  test("numeric params are range-checked", () => {
    const opts = { defaultValue: 2, min: 0.1, max: 10 };
    assert.deepEqual(parseNumberParam(null, "riskPct", opts), { ok: true, value: 2 });
    assert.deepEqual(parseNumberParam("5", "riskPct", opts), { ok: true, value: 5 });
    assert.equal(parseNumberParam("abc", "riskPct", opts).ok, false);
    assert.equal(parseNumberParam("99", "riskPct", opts).ok, false);
    assert.equal(parseNumberParam("NaN", "riskPct", opts).ok, false);
  });
});
