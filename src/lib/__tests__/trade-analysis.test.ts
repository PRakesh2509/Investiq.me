import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  computeAtr,
  deriveTradeSetup,
  findSwings,
  getActiveMarketByTiming,
  getMarketTiming,
  isDataLayerDown,
  nextNseOpenMs,
  nextUsOpenMs,
  selectSetup,
  summarizeMarketSetups,
  SETUP_PARAMS,
  type SetupEngineInput,
  type TradeMarket,
} from "../trade-analysis.ts";
import {
  fetchMacroBackdrop,
  getGlobalHighProfitTrades,
  getIndianHighProfitTrades,
} from "../trade-analysis.server.ts";
import { tradeCandidateService, type FnoMarketSnapshot } from "../services/index.ts";
import { createContinuousEngine } from "../sensibull-continuous-engine.server.ts";
import type { WorkstationBar } from "../terminal-workstation.functions.ts";
import { makeGreeksSnapshot, makeSnapshot } from "./fixtures/fno-fixtures.ts";

const ist = (iso: string) => Date.parse(`${iso}+05:30`);

// Wednesday 2026-10-21 11:00 IST (NSE open) and Saturday 2026-10-24 11:00 IST (closed).
const OPEN_MS = ist("2026-10-21T11:00:00");
const WEEKEND_MS = ist("2026-10-24T11:00:00");

// ---------------------------------------------------------------------------------------------
// getMarketTiming / getActiveMarketByTiming
// ---------------------------------------------------------------------------------------------

describe("getMarketTiming (NSE, delegated to tradingSessionService)", () => {
  test("regular session on a trading weekday", () => {
    const t = getMarketTiming("NSE_FNO", ist("2026-10-21T11:00:00"));
    assert.equal(t.isRegularMarketOpen, true);
    assert.equal(t.isSessionActive, true);
    assert.equal(t.isMarketClosed, false);
    assert.equal(t.phase, "NORMAL_SESSION");
    assert.equal(t.currentISTTime, "11:00 AM IST");
  });

  test("closed after the bell, next session is the next trading morning", () => {
    const t = getMarketTiming("NSE_FNO", ist("2026-10-21T16:00:00"));
    assert.equal(t.isRegularMarketOpen, false);
    assert.equal(t.isMarketClosed, true);
    assert.match(t.nextSessionStartIST, /^Thu 22 Oct, 09:15 AM IST$/);
    assert.match(t.executionWindow, /Queued/);
  });

  test("pre-market 09:00-09:15 IST is flagged but not a regular session", () => {
    const t = getMarketTiming("NSE_FNO", ist("2026-10-21T09:05:00"));
    assert.equal(t.isPreMarketOpen, true);
    assert.equal(t.isRegularMarketOpen, false);
    assert.equal(t.isMarketClosed, true);
  });

  test("NSE holiday (Dussehra, Tue 2026-10-20) is closed and skipped for the next session", () => {
    const t = getMarketTiming("NSE_FNO", ist("2026-10-20T11:00:00"));
    assert.equal(t.isRegularMarketOpen, false);
    assert.equal(t.phase, "HOLIDAY");
    assert.equal(t.holidayName, "Dussehra");
    assert.match(t.statusText, /NSE HOLIDAY/);
    assert.match(t.nextSessionStartIST, /^Wed 21 Oct, 09:15 AM IST$/);
  });

  test("weekend: Saturday 00:30 IST is weekend although it is still Friday in UTC", () => {
    // 2026-10-23T19:00Z is Friday in UTC but Saturday 00:30 in IST.
    const ms = Date.UTC(2026, 9, 23, 19, 0);
    assert.equal(new Date(ms).getUTCDay(), 5);
    const t = getMarketTiming("NSE_FNO", ms);
    assert.equal(t.phase, "WEEKEND");
    assert.equal(t.isRegularMarketOpen, false);
    assert.match(t.nextSessionStartIST, /^Mon 26 Oct, 09:15 AM IST$/);
  });

  test("Monday 00:30 IST is a weekday although it is still Sunday in UTC", () => {
    // 2026-10-25T19:00Z is Sunday in UTC but Monday 00:30 in IST.
    const ms = Date.UTC(2026, 9, 25, 19, 0);
    assert.equal(new Date(ms).getUTCDay(), 0);
    const t = getMarketTiming("NSE_FNO", ms);
    assert.equal(t.phase, "CLOSED", "a trading weekday before the open, not WEEKEND");
    assert.match(t.nextSessionStartIST, /^Mon 26 Oct, 09:15 AM IST$/);
  });

  test("Friday 23:30 IST and Saturday midday are closed", () => {
    assert.equal(getMarketTiming("NSE_FNO", ist("2026-10-23T23:30:00")).isMarketClosed, true);
    assert.equal(getMarketTiming("NSE_FNO", WEEKEND_MS).phase, "WEEKEND");
  });
});

describe("getMarketTiming (US session)", () => {
  test("US regular session in the IST evening (EDT: 19:00-01:30 IST)", () => {
    const t = getMarketTiming("GLOBAL_US", ist("2026-10-21T20:00:00"));
    assert.equal(t.isRegularMarketOpen, true);
    assert.equal(t.isPreMarketOpen, false);
    assert.equal(t.isSessionActive, true);
    assert.equal(t.regularHoursIST, "07:00 PM - 01:30 AM IST");
    assert.match(t.statusText, /LIVE US REGULAR/);
  });

  test("still the Wednesday US session at 00:45 IST on Thursday", () => {
    const t = getMarketTiming("GLOBAL_US", ist("2026-10-22T00:45:00"));
    assert.equal(t.isRegularMarketOpen, true);
  });

  test("after the US close the cash session is closed", () => {
    const t = getMarketTiming("GLOBAL_US", ist("2026-10-22T02:00:00"));
    assert.equal(t.isRegularMarketOpen, false);
    assert.equal(t.isPreMarketOpen, false);
  });

  test("US pre-market 04:00-09:30 ET (07:30 ET = 17:00 IST in EDT)", () => {
    const t = getMarketTiming("GLOBAL_US", ist("2026-10-21T17:00:00"));
    assert.equal(t.isPreMarketOpen, true);
    assert.equal(t.isRegularMarketOpen, false);
    assert.match(t.statusText, /PRE-MARKET/);
  });

  test("US cash session shifts by one hour in winter time (EST: 20:00-02:30 IST)", () => {
    const t = getMarketTiming("GLOBAL_US", ist("2026-12-02T20:30:00"));
    assert.equal(t.isRegularMarketOpen, true);
    assert.equal(t.regularHoursIST, "08:00 PM - 02:30 AM IST");
    // 19:30 IST is only 09:00 ET in winter: pre-market, not regular.
    const early = getMarketTiming("GLOBAL_US", ist("2026-12-02T19:30:00"));
    assert.equal(early.isRegularMarketOpen, false);
    assert.equal(early.isPreMarketOpen, true);
  });

  test("Friday-night US session carries into Saturday 00:45 IST", () => {
    const t = getMarketTiming("GLOBAL_US", ist("2026-10-24T00:45:00"));
    assert.equal(t.isRegularMarketOpen, true);
  });

  test("weekend and NYSE holidays are closed for the cash session", () => {
    assert.equal(
      getMarketTiming("GLOBAL_US", ist("2026-10-24T20:00:00")).isRegularMarketOpen,
      false,
    );
    assert.equal(
      getMarketTiming("GLOBAL_US", ist("2026-10-25T20:00:00")).isRegularMarketOpen,
      false,
    );
    const thanksgiving = getMarketTiming("GLOBAL_US", ist("2026-11-26T21:00:00"));
    assert.equal(thanksgiving.isRegularMarketOpen, false);
    assert.equal(thanksgiving.holidayName, "Thanksgiving Day");
  });

  test("next opens skip weekends and holidays", () => {
    // After the Friday close the next NSE open is Monday 09:15 IST.
    assert.equal(nextNseOpenMs(ist("2026-10-23T18:00:00")), ist("2026-10-26T09:15:00"));
    // Friday 2026-04-03 is Good Friday for both exchanges.
    assert.equal(nextNseOpenMs(ist("2026-04-02T18:00:00")), ist("2026-04-06T09:15:00"));
    // US cash opens 09:30 ET = 19:00 IST (EDT) on the next weekday.
    assert.equal(nextUsOpenMs(ist("2026-10-23T12:00:00")), ist("2026-10-23T19:00:00"));
    assert.equal(nextUsOpenMs(ist("2026-10-24T12:00:00")), ist("2026-10-26T19:00:00"));
  });
});

describe("getActiveMarketByTiming", () => {
  test("NSE hours -> NSE live", () => {
    const a = getActiveMarketByTiming(ist("2026-10-21T11:00:00"));
    assert.equal(a.activeMarket, "NSE_FNO");
    assert.equal(a.activeKeyType, "NSE_FNO");
    assert.equal(a.isLiveSession, true);
  });

  test("US evening -> US live", () => {
    const a = getActiveMarketByTiming(ist("2026-10-21T20:00:00"));
    assert.equal(a.activeMarket, "GLOBAL_US");
    assert.equal(a.activeKeyType, "GLOBAL");
    assert.equal(a.isLiveSession, true);
    assert.equal(a.isPreMarket, false);
  });

  test("US pre-market counts as live for the US", () => {
    const a = getActiveMarketByTiming(ist("2026-10-21T17:00:00"));
    assert.equal(a.activeMarket, "GLOBAL_US");
    assert.equal(a.isPreMarket, true);
  });

  test("both closed on a weekend: the earlier next open (NSE Monday) wins, not live", () => {
    const a = getActiveMarketByTiming(WEEKEND_MS);
    assert.equal(a.activeMarket, "NSE_FNO");
    assert.equal(a.isLiveSession, false);
    assert.match(a.marketReason, /Mon 26 Oct, 09:15 AM IST/);
  });

  test("NSE holiday morning: the US session (opening first) is next", () => {
    const a = getActiveMarketByTiming(ist("2026-10-20T11:00:00"));
    assert.equal(a.activeMarket, "GLOBAL_US");
    assert.equal(a.isLiveSession, false);
  });
});

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

const bar = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
): WorkstationBar => ({
  time,
  open,
  high,
  low,
  close,
  volume: 100,
});

describe("computeAtr / findSwings", () => {
  test("Wilder ATR over constant true range equals that range", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i * 300, 100, 105, 101, 103));
    // high-low = 4; |high-prevClose| = 2; |low-prevClose| = 2 -> TR = 4
    assert.equal(computeAtr(bars), 4);
  });

  test("ATR is unavailable with too few candles", () => {
    assert.equal(computeAtr([bar(0, 1, 2, 0.5, 1.5)]), null);
    assert.equal(computeAtr([]), null);
  });

  test("finds fractal swing highs and lows", () => {
    const highs = [10, 11, 12, 15, 12, 11, 10, 11, 12, 13, 12, 11, 10];
    const bars = highs.map((h, i) => bar(i * 300, h - 1, h, h - 2, h - 1));
    const sw = findSwings(bars);
    assert.deepEqual(sw.highs, [15, 13]);
    assert.ok(sw.lows.length >= 1);
  });
});

// ---------------------------------------------------------------------------------------------
// Setup derivation from the real engine pipeline (fixture data, injected clock)
// ---------------------------------------------------------------------------------------------

/** Alternating +4 / -2 closes: a noisy uptrend with RSI well below the overbought gate. */
function makeChoppyBars(n: number, endMs: number, base: number, dir: 1 | -1 = 1): WorkstationBar[] {
  const endSec = Math.floor(endMs / 1000);
  return Array.from({ length: n }, (_, i) => {
    const close = base + dir * i + (i % 2 ? 3 : -3) * dir;
    return {
      time: endSec - (n - 1 - i) * 300,
      open: close - 1,
      high: close + 1.5,
      low: close - 2,
      close,
      volume: 1000 + i,
    };
  });
}

interface BuildOpts {
  simulated?: boolean;
  greeksSimulated?: boolean;
  bars?: WorkstationBar[];
  atmQuote?: { bid: number | null; ask: number | null };
  fail?: boolean;
}

async function buildState(opts: BuildOpts = {}): Promise<SetupEngineInput> {
  const engine = createContinuousEngine({
    ttlMs: 0,
    deps: {
      now: () => Date.now(),
      getMarketSnapshot: async (instrument): Promise<FnoMarketSnapshot> => {
        if (opts.fail) throw new Error("provider down");
        return {
          ...makeSnapshot({
            nowMs: Date.now(),
            simulated: opts.simulated,
            bars: opts.bars ?? makeChoppyBars(80, Date.now(), 22800),
            atmQuote: opts.atmQuote,
          }),
          instrument,
        };
      },
      getGreeksSnapshot: async (instrument) => {
        if (opts.fail) throw new Error("provider down");
        const snap = makeSnapshot({
          nowMs: Date.now(),
          bars: opts.bars ?? makeChoppyBars(80, Date.now(), 22800),
        });
        return { ...makeGreeksSnapshot(snap, { simulated: opts.greeksSimulated }), instrument };
      },
    },
  });
  return engine.getState("NIFTY 50");
}

const NSE_CONFIG = { lotSize: 25, currency: "₹" };

const derive = (state: SetupEngineInput, extra: { nowMs?: number; market?: TradeMarket } = {}) =>
  deriveTradeSetup(state, {
    market: extra.market ?? "NSE_FNO",
    config: NSE_CONFIG,
    nowMs: extra.nowMs ?? OPEN_MS,
    macro: null,
  });

describe("deriveTradeSetup", () => {
  beforeEach(() => {
    tradeCandidateService.reset();
    mock.timers.enable({ apis: ["Date"], now: OPEN_MS });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  test("derives a setup from fixture candles and chain with stated formulas", async () => {
    const state = await buildState();
    assert.equal(
      state.candidates?.noTradeDecision,
      undefined,
      "engine gates pass on live fixtures",
    );
    const r = derive(state);

    assert.equal(r.status, "SETUP_AVAILABLE");
    const s = r.setup;
    assert.ok(s);
    assert.equal(s.market, "NSE_FNO");
    assert.equal(s.symbol, "NIFTY 50");
    assert.equal(s.optionType, "CE");
    assert.equal(s.contract, "NIFTY50 22900 CE");
    assert.equal(s.lotSize, 25);
    assert.equal(s.currency, "₹");
    assert.equal(s.isSimulated, false);
    assert.equal(s.generatedAt, new Date(OPEN_MS).toISOString());
    assert.match(s.dataSource ?? "", /DhanHQ v2/);

    // Entry is the real ask of the ATM call (40.0 LTP, 39.9 bid / 40.1 ask in the fixture).
    assert.equal(s.entryPrice, 40.1);
    assert.equal(s.premiumEntryRange, "₹39.90 - ₹40.10");

    // Stop / targets follow the documented formulas from the ATR of the real candles.
    const calc = s.calculation;
    assert.ok(calc);
    const atr = computeAtr(state.fnoSnapshot?.bars ?? []);
    assert.ok(atr !== null);
    assert.equal(calc.atr14, +atr.toFixed(2));
    assert.equal(calc.riskSpotPoints, +(SETUP_PARAMS.stopAtrMultiple * atr).toFixed(2));
    const rawLoss = 0.52 * (2 * atr) - 0.5 * 0.0012 * (2 * atr) ** 2;
    const loss = Math.min(0.45 * 40.1, Math.max(0.08 * 40.1, rawLoss));
    const tick = (n: number) => +(Math.round(n / 0.05) * 0.05).toFixed(2);
    assert.equal(s.stopLossPrice, tick(40.1 - loss));
    const risk = +(40.1 - s.stopLossPrice).toFixed(2);
    assert.equal(calc.premiumRiskPerUnit, risk);
    assert.equal(s.target1, tick(40.1 + risk));
    assert.equal(s.target2, tick(40.1 + 2 * risk));
    assert.equal(s.target3, tick(40.1 + 3 * risk));
    assert.ok(s.stopLossPrice < s.entryPrice && s.entryPrice < s.target1);
    assert.equal(s.riskRewardRatio, `1 : ${((s.target2 - 40.1) / risk).toFixed(1)}`);
    assert.ok(calc.spotTargets.t1 > s.spotPrice, "call targets are above spot");
    assert.ok(calc.formulas.length >= 4);

    // Technicals come from the real bars, not constants.
    const ct = s.chartTechnicals;
    assert.equal(ct.trend === "BULLISH" || ct.trend === "STRONGLY BULLISH", true);
    assert.equal(ct.atr14, +atr.toFixed(2));
    assert.ok(ct.rsi14 !== null && ct.rsi14 < SETUP_PARAMS.rsiOverbought);
    assert.ok(ct.ema20 !== null && ct.ema50 !== null);
    assert.equal(ct.ema200, null, "only 80 bars: EMA200 is unavailable, not invented");
    assert.doesNotMatch(ct.chartPattern, /Head|Shoulders|triangle|flag/i);

    // Greeks block comes from the chain; IV percentile has no source.
    assert.equal(s.greeks.atmStrike, 22900);
    assert.equal(s.greeks.ivPercentile, null);
    assert.equal(s.greeks.pcrOpenInterest, 1.3);
    assert.equal(s.greeks.pcrVolume, +(380000 / 400000).toFixed(2));

    // No hardcoded geopolitics: the section is marked unavailable without macro quotes.
    assert.equal(s.geopolitics?.available, false);
    assert.equal(s.geopolitics?.indicators.length, 0);

    // Data quality records the provenance.
    assert.equal(s.dataQuality?.technicals, "REAL");
    assert.equal(s.dataQuality?.chain, "LIVE_BROKER");
    assert.equal(s.dataQuality?.candles.source, "YAHOO_5M");
    assert.equal(s.dataQuality?.candles.ageSeconds, 0);
    assert.equal(s.dataQuality?.macro, "UNAVAILABLE");
    assert.equal(s.conviction?.marketBias, state.fnoSignalAnalysis?.marketBias);
    assert.ok(s.timing.isRegularMarketOpen);
  });

  test("global market maps option type words and keeps the derived numbers", async () => {
    const state = await buildState();
    const r = deriveTradeSetup(state, {
      market: "GLOBAL_US",
      config: { lotSize: 1, currency: "$" },
      nowMs: OPEN_MS,
      macro: {
        available: true,
        source: "test",
        asOf: null,
        indicators: [{ symbol: "^VIX", label: "CBOE VIX", price: 15, changePct: 1, asOf: null }],
        summary: "CBOE VIX 15 (+1% d/d)",
      },
    });
    assert.equal(r.setup?.optionType, "CALL");
    assert.equal(r.setup?.contract, "NIFTY50 22900 CALL");
    assert.equal(r.setup?.geopolitics?.summary, "CBOE VIX 15 (+1% d/d)");
    assert.equal(r.setup?.dataQuality?.macro, "REAL");
  });

  test("bearish structure with bullish option flow gives no setup (never a placeholder)", async () => {
    const state = await buildState({ bars: makeChoppyBars(80, OPEN_MS, 22900, -1) });
    const r = derive(state);
    assert.equal(r.setup, null);
    assert.equal(r.status, "NO_TRADE");
    assert.ok(r.reason.length > 0);
  });

  test("no setup when the nearest wall is closer than Target 1", async () => {
    // Final close 22898: the 22900 call-OI wall is 2 points above spot.
    const state = await buildState({ bars: makeChoppyBars(80, OPEN_MS, 22816) });
    const r = derive(state);
    assert.equal(r.setup, null);
    assert.equal(r.status, "NO_TRADE");
    assert.match(r.reason, /resistance|away/i);
  });

  test("simulated option chain -> DATA_SIMULATED with an empty list", async () => {
    const state = await buildState({ simulated: true });
    const r = derive(state);
    assert.equal(r.status, "DATA_SIMULATED");
    assert.equal(r.setup, null);
    assert.match(r.reason, /simulated/i);
  });

  test("simulated Greeks -> DATA_SIMULATED", async () => {
    const state = await buildState({ greeksSimulated: true });
    const r = derive(state);
    assert.equal(r.status, "DATA_SIMULATED");
    assert.equal(r.setup, null);
  });

  test("no real candles -> DATA_UNAVAILABLE", async () => {
    const state = await buildState({ bars: [] });
    const r = derive(state);
    assert.equal(r.status, "DATA_UNAVAILABLE");
    assert.equal(r.setup, null);
    assert.equal(r.dataQuality.technicals, "UNAVAILABLE");
  });

  test("provider failure (engine ERROR state) -> DATA_UNAVAILABLE", async () => {
    const state = await buildState({ fail: true });
    assert.equal(state.status, "ERROR");
    const r = derive(state);
    assert.equal(r.status, "DATA_UNAVAILABLE");
    assert.equal(r.setup, null);
    assert.equal(r.dataQuality.chain, "UNAVAILABLE");
  });

  test("stale chain, delayed chain and stale candles are rejected", async () => {
    const state = await buildState();
    const snap = state.fnoSnapshot as FnoMarketSnapshot;

    const stale = derive({
      ...state,
      fnoSnapshot: {
        ...snap,
        validation: { ...snap.validation, isValid: false, freshnessStatus: "STALE" },
      },
    });
    assert.equal(stale.status, "DATA_STALE");
    assert.equal(stale.setup, null);

    const delayed = derive({
      ...state,
      fnoSnapshot: { ...snap, validation: { ...snap.validation, freshnessStatus: "DELAYED" } },
    });
    assert.equal(delayed.status, "DATA_DELAYED");
    assert.equal(delayed.setup, null);

    // Same data evaluated 20 minutes later: the chain timestamp and last candle are too old.
    const late = derive(state, { nowMs: OPEN_MS + 20 * 60_000 });
    assert.equal(late.status, "DATA_STALE");
    assert.equal(late.setup, null);

    // Candle-only staleness (chain refreshed, candles not).
    const freshChainOldBars = derive(
      {
        ...state,
        fnoSnapshot: { ...snap, chainTimestamp: new Date(OPEN_MS + 20 * 60_000).toISOString() },
      },
      { nowMs: OPEN_MS + 20 * 60_000 },
    );
    assert.equal(freshChainOldBars.status, "DATA_STALE");
    assert.match(freshChainOldBars.reason, /candle/i);
  });

  test("closed session (weekend) -> MARKET_CLOSED, even with otherwise good data", async () => {
    mock.timers.setTime(WEEKEND_MS);
    const state = await buildState();
    const r = derive(state, { nowMs: WEEKEND_MS });
    assert.equal(r.status, "MARKET_CLOSED");
    assert.equal(r.setup, null);
    assert.match(r.reason, /closed|weekend/i);
  });

  test("a wide real bid/ask spread blocks the setup", async () => {
    const state = await buildState({ atmQuote: { bid: 30, ask: 50 } });
    const r = derive(state);
    assert.equal(r.setup, null);
    assert.ok(["NO_TRADE", "DATA_UNAVAILABLE"].includes(r.status));
  });

  test("a leg without a two-sided quote never gets a made-up price", async () => {
    const state = await buildState({ atmQuote: { bid: null, ask: null } });
    const r = derive(state);
    assert.equal(r.setup, null);
  });
});

// ---------------------------------------------------------------------------------------------
// Market-level helpers
// ---------------------------------------------------------------------------------------------

describe("market-level summaries and selection", () => {
  beforeEach(() => {
    tradeCandidateService.reset();
    mock.timers.enable({ apis: ["Date"], now: OPEN_MS });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  test("summarizeMarketSetups surfaces the most informative blocker and selectSetup mirrors it", async () => {
    const simulated = derive(await buildState({ simulated: true }));
    const stale = { ...simulated, status: "DATA_STALE" as const, reason: "stale chain" };
    const summary = summarizeMarketSetups("NSE_FNO", [stale, simulated], null, OPEN_MS);
    assert.equal(summary.setups.length, 0);
    assert.equal(summary.status, "DATA_SIMULATED", "simulated data outranks stale in the summary");
    assert.equal(isDataLayerDown(summary), false);

    const sel = selectSetup(summary, null);
    assert.equal(sel.setup, null);
    assert.equal(sel.status, summary.status);
    assert.equal(sel.reason, summary.reason);

    const bySymbol = selectSetup(summary, "nifty-50");
    assert.equal(bySymbol.setup, null);
    assert.equal(bySymbol.reason.length > 0, true);
  });

  test("isDataLayerDown only when every instrument is DATA_UNAVAILABLE", async () => {
    const down = derive(await buildState({ fail: true }));
    assert.equal(
      isDataLayerDown(summarizeMarketSetups("NSE_FNO", [down, down], null, OPEN_MS)),
      true,
    );
    const sim = derive(await buildState({ simulated: true }));
    assert.equal(
      isDataLayerDown(summarizeMarketSetups("NSE_FNO", [down, sim], null, OPEN_MS)),
      false,
    );
  });

  test("selectSetup picks the requested symbol, else the highest conviction", async () => {
    const good = derive(await buildState());
    assert.ok(good.setup);
    const summary = summarizeMarketSetups("NSE_FNO", [good], null, OPEN_MS);
    assert.equal(summary.status, "SETUP_AVAILABLE");
    assert.equal(selectSetup(summary).setup?.symbol, "NIFTY 50");
    assert.equal(selectSetup(summary, "NIFTY 50").setup?.symbol, "NIFTY 50");
    const other = selectSetup(summary, "BANK NIFTY");
    assert.equal(other.setup, null);
    assert.notEqual(other.status, "SETUP_AVAILABLE");
  });
});

// ---------------------------------------------------------------------------------------------
// Server loaders (injected dependencies, no network)
// ---------------------------------------------------------------------------------------------

describe("high-profit trade loaders", () => {
  beforeEach(() => {
    tradeCandidateService.reset();
    mock.timers.enable({ apis: ["Date"], now: OPEN_MS });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  test("returns derived setups with injected engine state and macro", async () => {
    const state = await buildState();
    const res = await getIndianHighProfitTrades({
      instruments: ["NIFTY 50"],
      deps: {
        loadEngineState: async () => state,
        loadMacro: async () => null,
        now: () => OPEN_MS,
      },
    });
    assert.equal(res.status, "SETUP_AVAILABLE");
    assert.equal(res.setups.length, 1);
    assert.equal(res.setups[0].symbol, "NIFTY 50");
    assert.equal(res.timing.isRegularMarketOpen, true);
  });

  test("an engine that throws becomes an explicit DATA_UNAVAILABLE with an empty list", async () => {
    const res = await getGlobalHighProfitTrades({
      instruments: ["S&P 500"],
      deps: {
        loadEngineState: async () => {
          throw new Error("boom");
        },
        loadMacro: async () => null,
        now: () => OPEN_MS,
      },
    });
    assert.deepEqual(res.setups, []);
    assert.equal(res.status, "DATA_UNAVAILABLE");
    assert.match(res.reason, /boom/);
    assert.equal(isDataLayerDown(res), true);
  });

  test("unknown instruments are refused, not substituted", async () => {
    const res = await getIndianHighProfitTrades({
      instruments: ["NOT A SYMBOL"],
      deps: {
        loadEngineState: async () => {
          throw new Error("must not be called");
        },
        loadMacro: async () => null,
        now: () => OPEN_MS,
      },
    });
    assert.deepEqual(res.setups, []);
    assert.match(res.reason, /Unknown instrument/);
  });
});

describe("fetchMacroBackdrop", () => {
  const yahoo = (price: number, prev: number) =>
    new Response(
      JSON.stringify({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: price,
                chartPreviousClose: prev,
                regularMarketTime: 1_761_000_000,
              },
            },
          ],
        },
      }),
      { status: 200 },
    );

  test("builds a factual summary from real quotes (no sentiment is invented)", async () => {
    const macro = await fetchMacroBackdrop("GLOBAL_US", async () => yahoo(15, 14.5));
    assert.equal(macro.available, true);
    assert.equal(macro.indicators.length, 4);
    assert.equal(macro.indicators[0].changePct, 3.45);
    assert.match(macro.summary, /CBOE VIX 15 \(\+3\.45% d\/d\)/);
    assert.ok(macro.asOf);
    assert.equal("overallMacroSentiment" in macro, false);
  });

  test("upstream failure -> available:false, never throws", async () => {
    const macro = await fetchMacroBackdrop("NSE_FNO", async () => {
      throw new Error("network");
    });
    assert.equal(macro.available, false);
    assert.deepEqual(macro.indicators, []);
    const bad = await fetchMacroBackdrop("NSE_FNO", async () => new Response("x", { status: 500 }));
    assert.equal(bad.available, false);
  });
});
