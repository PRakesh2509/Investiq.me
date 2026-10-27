/**
 * High-profit trade analysis for Indian (NSE F&O) and US (CME / CBOE index) markets.
 *
 * Every number in a setup is DERIVED from real inputs; nothing is hardcoded:
 *   - session / timing        : tradingSessionService (IST-correct, NSE holiday aware) plus a
 *                               New York clock for the US cash session
 *   - technicals              : real 5-minute candles (EMA / RSI / Supertrend / VWAP / swing S&R)
 *   - option premiums & Greeks: the provider option chain (real bid / ask / LTP, delta, gamma, ...)
 *   - gating                  : the continuous engine's candidate service + 7-factor score
 *                               (simulated, stale, delayed, closed-session or missing data never
 *                               yields a setup)
 *
 * When any required input is missing the result is `setup: null` with an explicit `status`,
 * `reason` and `dataQuality`; there is never a placeholder setup.
 *
 * This module is client-safe (pure, no server imports, no timers or I/O). The async loaders that
 * pull engine state from the server live in `trade-analysis.server.ts`.
 *
 * Levels (all premium figures are per unit of the option):
 *   entry   = net ask of the BUY legs minus net bid of the SELL legs (executable side)
 *   riskSpot = STOP_ATR_MULTIPLE x ATR(14) of the 5-minute underlying candles
 *   loss    = |netDelta| x riskSpot - 0.5 x netGamma x riskSpot^2   (clamped to 8%..45% of entry)
 *   stop    = entry - loss
 *   R       = entry - stop;  T1 / T2 / T3 = entry + 1R / 2R / 3R  (capped for spreads)
 *   spot move for target k solves |netDelta| d + 0.5 netGamma d^2 = k R
 * Theta and IV changes are not modelled; the figures are intraday approximations, not forecasts.
 */

import { tradingSessionService, NSE_HOLIDAYS_2026 } from "./services/tradingSessionService.ts";
import type { TradingSessionInfo } from "./services/tradingSessionService.ts";
import { ema, rsi, supertrend } from "./indicators.ts";
import type { BackendContinuousState } from "./sensibull-continuous-engine.server.ts";

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type TradeMarket = "NSE_FNO" | "GLOBAL_US";

export interface MarketTimingInfo {
  market: TradeMarket;
  sessionName: string;
  regularHoursIST: string;
  regularHoursLocal: string;
  isSessionActive: boolean;
  isRegularMarketOpen: boolean;
  isPreMarketOpen: boolean;
  isMarketClosed: boolean;
  currentISTTime: string;
  statusText: string;
  executionWindow: string;
  nextSessionStartIST: string;
  /** Session phase reported by tradingSessionService (NSE) or derived for the US session. */
  phase?: string;
  /** Exchange holiday name when today is a holiday. */
  holidayName?: string;
  /** ISO timestamp of the next regular session open. */
  nextSessionStartISO?: string;
}

export interface ChartTechnicals {
  timeframe: string;
  trend: "STRONGLY BULLISH" | "BULLISH" | "BEARISH" | "STRONGLY BEARISH" | "RANGEBOUND";
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  vwap: number | null;
  supertrend: string;
  rsi14: number | null;
  atr14: number | null;
  support1: number | null;
  support2: number | null;
  resistance1: number | null;
  resistance2: number | null;
  /** Swing-structure description computed from the candles (not a chart-pattern detector). */
  chartPattern: string;
  keyObservation: string;
}

export interface OptionGreeksAnalysis {
  atmStrike: number;
  callDelta: number;
  putDelta: number;
  gamma: number;
  thetaPerDay: number;
  vega: number;
  /** No IV history is available, so a true IV percentile cannot be computed. */
  ivPercentile: number | null;
  atmIv: number | null;
  pcrVolume: number | null;
  pcrOpenInterest: number;
  maxPainStrike: number;
  oiBuildUpSummary: string;
  greeksRecommendation: string;
}

export interface MacroIndicator {
  symbol: string;
  label: string;
  price: number;
  changePct: number | null;
  asOf: string | null;
}

/** Market-wide context from real quotes; `available: false` when none could be fetched. */
export interface GeopoliticalMacroAnalysis {
  available: boolean;
  source: string;
  asOf: string | null;
  indicators: MacroIndicator[];
  summary: string;
  note?: string;
}

export type MacroBackdrop = GeopoliticalMacroAnalysis;

export type SetupStatus =
  | "SETUP_AVAILABLE"
  | "NO_TRADE"
  | "MARKET_CLOSED"
  | "DATA_UNAVAILABLE"
  | "DATA_SIMULATED"
  | "DATA_STALE"
  | "DATA_DELAYED";

export interface SetupDataQuality {
  provider: string | null;
  chain: string;
  greeks: string;
  technicals: "REAL" | "UNAVAILABLE";
  candles: { source: string; lastBarAt: string | null; ageSeconds: number | null; count: number };
  freshness: { chainStatus: string; chainAgeSeconds: number | null };
  session: { phase: string; isMarketOpen: boolean; text: string } | null;
  macro: "REAL" | "UNAVAILABLE";
  notes: string[];
}

export interface SetupCalculation {
  formulas: string[];
  atr14: number;
  riskSpotPoints: number;
  netDelta: number;
  netGamma: number;
  premiumRiskPerUnit: number;
  spreadToRiskRatio: number;
  spotTargets: { t1: number; t2: number; t3: number };
  nearestOpposingLevel: number | null;
  roomToOpposingLevelPoints: number | null;
  cappedAtMaxProfit: boolean;
  entryBasis: "ASK (buy legs) / BID (sell legs)";
}

export interface HighProfitTradeSetup {
  tradeId: string;
  symbol: string;
  market: TradeMarket;
  action: "BUY" | "SELL";
  optionType: "CE" | "PE" | "CALL" | "PUT";
  contract: string;
  strategy: string;
  spotPrice: number;
  spotEntryTrigger: string;
  premiumEntryRange: string;
  entryPrice: number;
  stopLossPrice: number;
  target1: number;
  target2: number;
  target3: number;
  riskRewardRatio: string;
  /** Profit percentage IF target 2 is reached (not a forecast). */
  expectedProfitPctT2: string;
  lotSize: number;
  currency: string;
  timing: MarketTimingInfo;
  chartTechnicals: ChartTechnicals;
  greeks: OptionGreeksAnalysis;
  geopolitics?: GeopoliticalMacroAnalysis;
  bestProfitRationale: string;
  createdAt: string;
  // --- added fields (all optional for backward compatibility) ---
  dataQuality?: SetupDataQuality;
  /** Always false for an emitted setup: simulated inputs never produce one. */
  isSimulated?: boolean;
  dataSource?: string;
  generatedAt?: string;
  expiry?: string;
  calculation?: SetupCalculation;
  conviction?: {
    setupScore: number | null;
    confluenceScore: number;
    marketBias: string;
    tradeScore: {
      overall: number;
      confidence: number;
      dataCoverage: number;
      scoreCap: number | null;
    } | null;
  };
}

export interface TradeSetupResult {
  instrument: string;
  market: TradeMarket;
  status: SetupStatus;
  reason: string;
  reasons: string[];
  setup: HighProfitTradeSetup | null;
  dataQuality: SetupDataQuality;
  generatedAt: string;
}

export interface MarketSetupsResult {
  market: TradeMarket;
  /** SETUP_AVAILABLE when at least one setup exists, otherwise the most informative blocker. */
  status: SetupStatus;
  reason: string;
  setups: HighProfitTradeSetup[];
  perInstrument: TradeSetupResult[];
  dataQuality: SetupDataQuality;
  macro: MacroBackdrop | null;
  timing: MarketTimingInfo;
  generatedAt: string;
}

/** Engine state fields the derivation reads (a full BackendContinuousState satisfies it). */
export type SetupEngineInput = Pick<
  BackendContinuousState,
  | "instrument"
  | "status"
  | "session"
  | "fnoSnapshot"
  | "greeksSnapshot"
  | "greeksAnalysis"
  | "fnoSignalAnalysis"
  | "tradeScore"
  | "candidates"
  | "dataQuality"
>;

export interface InstrumentSetupConfig {
  lotSize: number;
  currency: string;
  isGlobal?: boolean;
}

/** Tunable constants of the derivation (documented in the module header). */
export const SETUP_PARAMS = {
  atrPeriod: 14,
  minAtrBars: 15,
  stopAtrMultiple: 2,
  minStopPctOfPremium: 0.08,
  maxStopPctOfPremium: 0.45,
  targetRMultiples: [1, 2, 3] as const,
  /** Spread targets stay below this share of the maximum spread profit. */
  spreadProfitCapShare: 0.9,
  /** Bid/ask spread may not exceed this share of the per-unit risk. */
  maxSpreadToRisk: 0.35,
  maxChainAgeSeconds: 300,
  maxCandleAgeSeconds: 900,
  rsiOverbought: 75,
  rsiOversold: 25,
  minAbsNetDelta: 0.05,
} as const;

// ---------------------------------------------------------------------------------------------
// Market timing (delegates to tradingSessionService)
// ---------------------------------------------------------------------------------------------

/** NYSE full-day closures for 2026 (cash session). */
export const NYSE_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
};

const US_INDEX_INSTRUMENT = "S&P 500";
const NSE_INSTRUMENT = "NIFTY 50";
const DAY_MS = 86_400_000;
const IST_OFFSET_MIN = 330;

const pad2 = (n: number) => String(n).padStart(2, "0");
const toMs = (now: Date | number | undefined): number =>
  now === undefined ? Date.now() : now instanceof Date ? now.getTime() : now;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ClockParts {
  y: number;
  m: number; // 1-12
  d: number;
  hour: number;
  minute: number;
  dow: number; // 0 = Sun
}

/** IST wall clock for an instant (pure UTC arithmetic: independent of the host time zone). */
function istParts(ms: number): ClockParts {
  const t = new Date(ms + IST_OFFSET_MIN * 60_000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

const isoDate = (p: Pick<ClockParts, "y" | "m" | "d">) => `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;

function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 || 12;
  return `${pad2(h12)}:${pad2(minute)} ${hour >= 12 ? "PM" : "AM"}`;
}

/** "09:15 AM" style IST time of day. */
function formatIstTime(ms: number): string {
  const p = istParts(ms);
  return formatClock(p.hour, p.minute);
}

/** "Wed 28 Oct, 09:15 AM IST" */
export function formatIstDateTime(ms: number): string {
  const p = istParts(ms);
  return `${WEEKDAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]}, ${formatClock(p.hour, p.minute)} IST`;
}

let etFormatter: Intl.DateTimeFormat | null = null;

/** New York wall clock for an instant (DST-aware through Intl). */
function etParts(ms: number): ClockParts {
  etFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const out: Partial<Record<string, string>> = {};
  for (const part of etFormatter.formatToParts(new Date(ms))) out[part.type] = part.value;
  return {
    y: Number(out.year),
    m: Number(out.month),
    d: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    dow: Math.max(0, WEEKDAYS.indexOf(out.weekday ?? "Sun")),
  };
}

/** Offset (minutes, negative for ET) of New York relative to UTC at an instant. */
function etOffsetMin(ms: number): number {
  const p = etParts(ms);
  return Math.round(
    (Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000) / 60_000,
  );
}

/** Instant of a New York wall-clock time (re-checks the offset to cross DST changes). */
function etWallToInstant(y: number, m: number, d: number, hour: number, minute: number): number {
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let inst = guess - etOffsetMin(guess) * 60_000;
  const off2 = etOffsetMin(inst);
  inst = guess - off2 * 60_000;
  return inst;
}

const isWeekday = (dow: number) => dow >= 1 && dow <= 5;

/** Next NSE regular-session open strictly after `ms` (09:15 IST on a non-holiday weekday). */
export function nextNseOpenMs(ms: number): number {
  const p = istParts(ms);
  for (let k = 0; k < 14; k++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + k));
    const dow = day.getUTCDay();
    const iso = isoDate({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() });
    if (!isWeekday(dow) || NSE_HOLIDAYS_2026[iso]) continue;
    const open =
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9, 15) -
      IST_OFFSET_MIN * 60_000;
    if (open > ms) return open;
  }
  return ms + DAY_MS;
}

/** Next US cash-session open (09:30 New York) strictly after `ms`. */
export function nextUsOpenMs(ms: number): number {
  const p = etParts(ms);
  for (let k = 0; k < 14; k++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + k));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (!isWeekday(day.getUTCDay()) || NYSE_HOLIDAYS_2026[isoDate({ y, m, d })]) continue;
    const open = etWallToInstant(y, m, d, 9, 30);
    if (open > ms) return open;
  }
  return ms + DAY_MS;
}

function nseTiming(ms: number): MarketTimingInfo {
  const info: TradingSessionInfo = tradingSessionService.getSessionInfo(
    new Date(ms),
    NSE_INSTRUMENT,
  );
  const ist = istParts(ms);
  const isRegular = info.phase === "NORMAL_SESSION" && info.isMarketOpen;
  const isPre = info.phase === "PRE_MARKET";
  const nextOpen = nextNseOpenMs(ms);
  const nextLabel = formatIstDateTime(nextOpen);
  const holidayName = info.phase === "HOLIDAY" ? NSE_HOLIDAYS_2026[info.istDateString] : undefined;

  return {
    market: "NSE_FNO",
    sessionName: "NSE Indian F&O Regular Market",
    regularHoursIST: "09:15 AM - 03:30 PM IST",
    regularHoursLocal: "09:15 AM - 03:30 PM IST",
    isSessionActive: isRegular,
    isRegularMarketOpen: isRegular,
    isPreMarketOpen: isPre,
    isMarketClosed: !isRegular,
    currentISTTime: `${formatClock(ist.hour, ist.minute)} IST`,
    statusText: isRegular
      ? "LIVE TRADING SESSION (09:15 - 15:30 IST)"
      : isPre
        ? "PRE-MARKET (09:00 - 09:15 IST): regular session opens 09:15 AM IST"
        : `${info.sessionText} (NEXT SESSION: ${nextLabel})`,
    executionWindow: isRegular
      ? "Active Intraday Execution Window"
      : `Queued for Next Session Open (${nextLabel})`,
    nextSessionStartIST: isRegular ? "Session active" : nextLabel,
    phase: info.phase,
    ...(holidayName ? { holidayName } : {}),
    nextSessionStartISO: new Date(nextOpen).toISOString(),
  };
}

function usTiming(ms: number): MarketTimingInfo {
  const info: TradingSessionInfo = tradingSessionService.getSessionInfo(
    new Date(ms),
    US_INDEX_INSTRUMENT,
  );
  const ist = istParts(ms);
  const et = etParts(ms);
  const etIso = isoDate(et);
  const holidayName = NYSE_HOLIDAYS_2026[etIso];
  const etMinutes = et.hour * 60 + et.minute;
  const tradingDay = isWeekday(et.dow) && !holidayName;
  const isRegular = tradingDay && etMinutes >= 570 && etMinutes < 960; // 09:30-16:00 ET
  const isPre = tradingDay && etMinutes >= 240 && etMinutes < 570; // 04:00-09:30 ET
  const globexOpen = info.isMarketOpen && !holidayName;
  const active = isRegular || isPre || globexOpen;

  // Regular-session hours in IST for the relevant trading day (DST-aware).
  const refDay = tradingDay ? et : etParts(nextUsOpenMs(ms));
  const openMs = etWallToInstant(refDay.y, refDay.m, refDay.d, 9, 30);
  const closeMs = etWallToInstant(refDay.y, refDay.m, refDay.d, 16, 0);
  const hoursIst = `${formatIstTime(openMs)} - ${formatIstTime(closeMs)} IST`;
  const nextOpen = nextUsOpenMs(ms);
  const nextLabel = formatIstDateTime(nextOpen);

  let statusText: string;
  if (isRegular) statusText = `LIVE US REGULAR TRADING SESSION (${hoursIst})`;
  else if (isPre) statusText = `US PRE-MARKET ACTIVE · OPENING BELL ${nextLabel}`;
  else if (globexOpen) {
    statusText = `US CASH MARKET CLOSED · CME GLOBEX FUTURES ACTIVE (cash opens ${nextLabel})`;
  } else if (holidayName)
    statusText = `US MARKET HOLIDAY — ${holidayName} (NEXT OPEN: ${nextLabel})`;
  else statusText = `US MARKET CLOSED (NEXT OPEN: ${nextLabel})`;

  return {
    market: "GLOBAL_US",
    sessionName: "US World Indices (NYSE / NASDAQ, CME futures options)",
    regularHoursIST: hoursIst,
    regularHoursLocal: "09:30 AM - 04:00 PM New York time",
    isSessionActive: active,
    isRegularMarketOpen: isRegular,
    isPreMarketOpen: isPre,
    isMarketClosed: !active,
    currentISTTime: `${formatClock(ist.hour, ist.minute)} IST`,
    statusText,
    executionWindow: isRegular
      ? "Immediate Regular Market Execution"
      : isPre
        ? `Pre-Market Placement & Opening Bell Fill (${nextLabel})`
        : globexOpen
          ? "CME Globex futures session (cash index closed)"
          : `Queued for US Session Open (${nextLabel})`,
    nextSessionStartIST: isRegular ? "Session active" : nextLabel,
    phase: isRegular
      ? "REGULAR"
      : isPre
        ? "PRE_MARKET"
        : globexOpen
          ? "GLOBEX_EXTENDED"
          : holidayName
            ? "HOLIDAY"
            : info.phase,
    ...(holidayName ? { holidayName } : {}),
    nextSessionStartISO: new Date(nextOpen).toISOString(),
  };
}

/**
 * Market timing for Indian & US markets. NSE state comes from tradingSessionService (IST weekday,
 * NSE holidays); the US state combines its CME/Globex handling with a New York clock (regular
 * 09:30-16:00 ET, pre-market 04:00-09:30 ET, NYSE holidays).
 */
export function getMarketTiming(market: TradeMarket, now?: Date | number): MarketTimingInfo {
  const ms = toMs(now);
  return market === "NSE_FNO" ? nseTiming(ms) : usTiming(ms);
}

/** Determines which market is currently active according to real-time market timings. */
export function getActiveMarketByTiming(now?: Date | number): {
  activeMarket: "GLOBAL_US" | "NSE_FNO";
  activeKeyType: "GLOBAL" | "NSE_FNO";
  isLiveSession: boolean;
  isPreMarket: boolean;
  marketReason: string;
  indianTiming: MarketTimingInfo;
  globalTiming: MarketTimingInfo;
} {
  const ms = toMs(now);
  const indian = getMarketTiming("NSE_FNO", ms);
  const global = getMarketTiming("GLOBAL_US", ms);

  const result = (
    activeMarket: "GLOBAL_US" | "NSE_FNO",
    isLiveSession: boolean,
    isPreMarket: boolean,
    marketReason: string,
  ) => ({
    activeMarket,
    activeKeyType: (activeMarket === "GLOBAL_US" ? "GLOBAL" : "NSE_FNO") as "GLOBAL" | "NSE_FNO",
    isLiveSession,
    isPreMarket,
    marketReason,
    indianTiming: indian,
    globalTiming: global,
  });

  if (global.isRegularMarketOpen) {
    return result(
      "GLOBAL_US",
      true,
      false,
      `US Regular Trading Session is LIVE NOW (${global.currentISTTime} · ${global.regularHoursIST})`,
    );
  }
  if (global.isPreMarketOpen) {
    return result(
      "GLOBAL_US",
      true,
      true,
      `US Pre-Market Session is ACTIVE (${global.currentISTTime}); cash opens ${global.nextSessionStartIST}`,
    );
  }
  if (indian.isRegularMarketOpen) {
    return result(
      "NSE_FNO",
      true,
      false,
      `NSE Indian F&O Trading Session is LIVE NOW (${indian.currentISTTime} · ${indian.regularHoursIST})`,
    );
  }
  if (indian.isPreMarketOpen) {
    return result(
      "NSE_FNO",
      true,
      true,
      `NSE Indian Pre-Market is ACTIVE (${indian.currentISTTime} · 09:00 AM - 09:15 AM IST)`,
    );
  }

  // Both closed: the market that opens first is the next active one.
  const nseNext = nextNseOpenMs(ms);
  const usNext = nextUsOpenMs(ms);
  if (nseNext <= usNext) {
    return result(
      "NSE_FNO",
      false,
      false,
      `Both markets closed (${indian.currentISTTime}). Next session: NSE F&O ${formatIstDateTime(nseNext)}.`,
    );
  }
  return result(
    "GLOBAL_US",
    false,
    false,
    `Both markets closed (${global.currentISTTime}). Next session: US market ${formatIstDateTime(usNext)}.`,
  );
}

// ---------------------------------------------------------------------------------------------
// Derivation helpers (pure)
// ---------------------------------------------------------------------------------------------

type Bars = NonNullable<SetupEngineInput["fnoSnapshot"]>["bars"];
type Row = NonNullable<SetupEngineInput["fnoSnapshot"]>["rows"][number];
type Leg = Row["call"];

const round2 = (n: number) => +n.toFixed(2);
const roundTick = (n: number) => +(Math.round(n / 0.05) * 0.05).toFixed(2);

function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

/** Wilder ATR over real candles; null when there are not enough bars. */
export function computeAtr(bars: Bars, period: number = SETUP_PARAMS.atrPeriod): number | null {
  if (!Array.isArray(bars) || bars.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  let atr = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < tr.length; i++) atr = (atr * (period - 1) + tr[i]) / period;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

/** Fractal swing highs / lows (3 bars each side) over the most recent candles, oldest first. */
export function findSwings(bars: Bars, span = 3, lookback = 200) {
  const win = bars.slice(-lookback);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = span; i < win.length - span; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= span; k++) {
      if (win[i].high <= win[i - k].high || win[i].high < win[i + k].high) isHigh = false;
      if (win[i].low >= win[i - k].low || win[i].low > win[i + k].low) isLow = false;
    }
    if (isHigh) highs.push(win[i].high);
    if (isLow) lows.push(win[i].low);
  }
  return { highs, lows };
}

function distinctLevels(levels: number[], spot: number): number[] {
  const out: number[] = [];
  for (const l of levels) {
    if (out.every((o) => Math.abs(o - l) / spot > 0.0005)) out.push(l);
  }
  return out;
}

function swingStructure(highs: number[], lows: number[]): string {
  if (highs.length < 2 || lows.length < 2) return "Insufficient swing points to describe structure";
  const hh = highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows[lows.length - 1] > lows[lows.length - 2];
  if (hh && hl) return "Higher swing highs and higher swing lows (uptrend structure)";
  if (!hh && !hl) return "Lower swing highs and lower swing lows (downtrend structure)";
  return "Mixed swing structure (no clean trend)";
}

function legHasQuote(leg: Leg | undefined): leg is Leg & { bid: number; ask: number } {
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

function emptyQuality(notes: string[]): SetupDataQuality {
  return {
    provider: null,
    chain: "UNAVAILABLE",
    greeks: "UNAVAILABLE",
    technicals: "UNAVAILABLE",
    candles: { source: "UNAVAILABLE", lastBarAt: null, ageSeconds: null, count: 0 },
    freshness: { chainStatus: "UNAVAILABLE", chainAgeSeconds: null },
    session: null,
    macro: "UNAVAILABLE",
    notes,
  };
}

function buildQuality(
  state: SetupEngineInput,
  nowMs: number,
  macro: MacroBackdrop | null | undefined,
  extraNotes: string[] = [],
): SetupDataQuality {
  const snap = state.fnoSnapshot;
  const lastBarMs = snap?.bars.length ? snap.bars[snap.bars.length - 1].time * 1000 : null;
  const chainTs = snap ? Date.parse(snap.chainTimestamp) : NaN;
  return {
    provider: snap?.provider ?? state.dataQuality?.provider ?? null,
    chain: snap?.dataSource ?? "UNAVAILABLE",
    greeks: state.greeksSnapshot?.dataSource ?? "UNAVAILABLE",
    technicals: state.fnoSignalAnalysis?.technical.available ? "REAL" : "UNAVAILABLE",
    candles: {
      source: snap?.barsSource ?? "UNAVAILABLE",
      lastBarAt: snap?.barsLastAt ?? null,
      ageSeconds: lastBarMs === null ? null : Math.max(0, Math.round((nowMs - lastBarMs) / 1000)),
      count: snap?.bars.length ?? 0,
    },
    freshness: {
      chainStatus: snap?.validation.freshnessStatus ?? "UNAVAILABLE",
      chainAgeSeconds: Number.isFinite(chainTs)
        ? Math.max(0, Math.round((nowMs - chainTs) / 1000))
        : null,
    },
    session: state.session
      ? {
          phase: state.session.phase,
          isMarketOpen: state.session.isMarketOpen,
          text: state.session.sessionText,
        }
      : (state.dataQuality?.session ?? null),
    macro: macro?.available ? "REAL" : "UNAVAILABLE",
    notes: [...(state.dataQuality?.notes ?? []), ...extraNotes],
  };
}

export interface DeriveSetupOptions {
  config: InstrumentSetupConfig;
  market: TradeMarket;
  /** Epoch ms used for staleness checks and timestamps (defaults to Date.now()). */
  nowMs?: number;
  macro?: MacroBackdrop | null;
}

/**
 * Derive a trade setup from the engine's evaluated state. Returns `setup: null` plus an explicit
 * status/reason for every unavailable, simulated, stale, delayed, closed-session or no-edge case.
 */
export function deriveTradeSetup(
  state: SetupEngineInput,
  opts: DeriveSetupOptions,
): TradeSetupResult {
  const nowMs = opts.nowMs ?? Date.now();
  const { market, config, macro } = opts;
  const instrument = state.instrument;
  const generatedAt = new Date(nowMs).toISOString();

  const blocked = (
    status: SetupStatus,
    reason: string,
    reasons: string[] = [],
  ): TradeSetupResult => ({
    instrument,
    market,
    status,
    reason,
    reasons: reasons.length > 0 ? reasons : [reason],
    setup: null,
    dataQuality: state.fnoSnapshot ? buildQuality(state, nowMs, macro) : buildQualityLite(state),
    generatedAt,
  });

  function buildQualityLite(s: SetupEngineInput): SetupDataQuality {
    const base = emptyQuality(s.dataQuality?.notes ?? []);
    if (s.session) {
      base.session = {
        phase: s.session.phase,
        isMarketOpen: s.session.isMarketOpen,
        text: s.session.sessionText,
      };
    } else if (s.dataQuality?.session) {
      base.session = s.dataQuality.session;
    }
    base.macro = macro?.available ? "REAL" : "UNAVAILABLE";
    return base;
  }

  // 1. Session gate (closed sessions never produce a fresh setup).
  const session = state.session;
  if (session && (!session.isMarketOpen || !session.canGenerateFreshCandidates)) {
    return blocked("MARKET_CLOSED", `Market closed: ${session.sessionText}`, [
      `Phase: ${session.phase}`,
      `Next session: ${session.nextSessionOpensAt}`,
    ]);
  }

  // 2. Data availability.
  const snap = state.fnoSnapshot;
  const greeksSnap = state.greeksSnapshot;
  const analysis = state.fnoSignalAnalysis;
  const greeksAnalysis = state.greeksAnalysis;
  if (state.status === "ERROR" || !snap || !greeksSnap || !analysis || !greeksAnalysis) {
    const why = state.dataQuality?.notes?.[0] ?? "Market data layer returned no usable snapshot";
    return blocked("DATA_UNAVAILABLE", why, state.dataQuality?.notes ?? [why]);
  }

  // 3. Simulated inputs are never tradeable.
  if (snap.isSimulated || greeksSnap.isSimulated) {
    const which = [
      snap.isSimulated ? "option chain" : null,
      greeksSnap.isSimulated ? "Greeks" : null,
    ]
      .filter(Boolean)
      .join(" and ");
    return blocked(
      "DATA_SIMULATED",
      `The ${which} is simulated/model-generated (no live broker feed); no setup is produced from it.`,
    );
  }

  // 4. Staleness / delay.
  const validation = snap.validation;
  const chainTs = Date.parse(snap.chainTimestamp);
  const chainAge = Number.isFinite(chainTs) ? (nowMs - chainTs) / 1000 : Number.POSITIVE_INFINITY;
  if (
    !validation.isValid ||
    validation.freshnessStatus === "STALE" ||
    validation.freshnessStatus === "INSUFFICIENT_DATA" ||
    greeksSnap.freshnessStatus === "STALE" ||
    chainAge > SETUP_PARAMS.maxChainAgeSeconds
  ) {
    return blocked(
      "DATA_STALE",
      `Option chain is stale or failed validation (status ${validation.freshnessStatus}, age ${Math.round(chainAge)}s).`,
      validation.issues.map((i) => `${i.field}: ${i.message}`),
    );
  }
  if (validation.freshnessStatus === "DELAYED") {
    return blocked(
      "DATA_DELAYED",
      "Option chain is delayed (not real-time); entry/stop levels need live quotes, so no setup is produced.",
    );
  }

  // 5. Technicals from real candles.
  const tech = analysis.technical;
  const bars = snap.bars;
  const lastBar = bars[bars.length - 1];
  if (!tech.available || !lastBar || bars.length < SETUP_PARAMS.minAtrBars) {
    return blocked(
      "DATA_UNAVAILABLE",
      `Technical indicators unavailable: ${tech.unavailableReason ?? "no real candles"}.`,
    );
  }
  const candleAge = nowMs / 1000 - lastBar.time;
  if (candleAge > SETUP_PARAMS.maxCandleAgeSeconds) {
    return blocked(
      "DATA_STALE",
      `Latest real candle is ${Math.round(candleAge / 60)} min old; technicals are stale.`,
    );
  }
  const atr = computeAtr(bars);
  if (atr === null) {
    return blocked("DATA_UNAVAILABLE", "ATR could not be computed from the real candles.");
  }

  // 6. Engine gates (hard risk checks and candidate service).
  const score = state.tradeScore;
  if (score && !score.allHardRiskPassed) {
    const failed = score.riskChecks.filter((c) => !c.passed && c.severity !== "INFO");
    return blocked(
      "NO_TRADE",
      `Hard risk gate failed: ${failed.map((c) => c.name).join("; ")}`,
      failed.map((c) => `${c.name}: ${c.observedValue}`),
    );
  }
  const cands = state.candidates;
  if (cands?.noTradeDecision) {
    const n = cands.noTradeDecision;
    const status: SetupStatus =
      n.reasonCode === "MARKET_CLOSED"
        ? "MARKET_CLOSED"
        : n.reasonCode === "DATA_STALE_OR_INSUFFICIENT"
          ? "DATA_UNAVAILABLE"
          : "NO_TRADE";
    return blocked(status, `${n.headline}. ${n.summary}`, n.evidence);
  }

  const bias = analysis.marketBias;
  const wantType: "CE" | "PE" | null = bias.includes("BULLISH")
    ? "CE"
    : bias.includes("BEARISH")
      ? "PE"
      : null;
  if (wantType === null) {
    return blocked("NO_TRADE", "No directional edge: market bias is neutral/rangebound.");
  }
  const bullish = wantType === "CE";

  const candidate = (cands?.activeCandidates ?? [])
    .filter(
      (c) =>
        c.instrument === instrument &&
        c.callPut === wantType &&
        (c.lifecycleStatus === "CONFIRMED" || c.lifecycleStatus === "WATCHING"),
    )
    .sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.setupScore - a.setupScore,
    )[0];
  if (!candidate) {
    return blocked(
      "NO_TRADE",
      `No gated trade candidate is active for a ${bullish ? "bullish (CE)" : "bearish (PE)"} bias.`,
    );
  }

  // 7. Direction must not fight the price structure.
  if ((bullish && tech.trend === "BEARISH") || (!bullish && tech.trend === "BULLISH")) {
    return blocked(
      "NO_TRADE",
      `Option-flow bias (${bias}) conflicts with the price trend (${tech.trend}).`,
    );
  }
  if (tech.rsi14 !== null) {
    if (bullish && tech.rsi14 >= SETUP_PARAMS.rsiOverbought) {
      return blocked(
        "NO_TRADE",
        `RSI14 ${tech.rsi14} is overbought; chasing a call has poor edge.`,
      );
    }
    if (!bullish && tech.rsi14 <= SETUP_PARAMS.rsiOversold) {
      return blocked("NO_TRADE", `RSI14 ${tech.rsi14} is oversold; chasing a put has poor edge.`);
    }
  }

  // 8. Real quotes for every leg.
  const rowByStrike = new Map(snap.rows.map((r) => [r.strike, r]));
  const legSpecs = candidate.legs.map((l) => {
    const row = rowByStrike.get(l.strike);
    const leg = row ? (l.type === "CE" ? row.call : row.put) : undefined;
    return { spec: l, leg };
  });
  if (legSpecs.some((x) => !legHasQuote(x.leg))) {
    return blocked(
      "DATA_UNAVAILABLE",
      "A leg of the candidate has no valid two-sided quote (LTP/bid/ask) in the current chain.",
    );
  }
  let entry = 0;
  let bidSide = 0;
  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  for (const { spec, leg } of legSpecs) {
    const l = leg as Leg & { bid: number; ask: number };
    const sign = spec.action === "BUY" ? 1 : -1;
    entry += spec.action === "BUY" ? l.ask : -l.bid;
    bidSide += spec.action === "BUY" ? l.bid : -l.ask;
    netDelta += sign * l.delta;
    netGamma += sign * l.gamma;
    netTheta += sign * l.theta;
    netVega += sign * l.vega;
  }
  entry = round2(entry);
  bidSide = round2(Math.max(0, bidSide));
  const absDelta = Math.abs(netDelta);
  if (
    !(entry > 0) ||
    !Number.isFinite(netDelta) ||
    !Number.isFinite(netGamma) ||
    absDelta < SETUP_PARAMS.minAbsNetDelta
  ) {
    return blocked(
      "DATA_UNAVAILABLE",
      "Net debit or Greeks of the candidate are unusable (non-positive premium or near-zero delta).",
    );
  }

  // 9. Levels from ATR and Greeks (formulas in the module header).
  const spot = snap.underlyingPrice;
  const riskSpot = SETUP_PARAMS.stopAtrMultiple * atr;
  const rawLoss = absDelta * riskSpot - 0.5 * netGamma * riskSpot * riskSpot;
  const loss = Math.min(
    SETUP_PARAMS.maxStopPctOfPremium * entry,
    Math.max(SETUP_PARAMS.minStopPctOfPremium * entry, rawLoss),
  );
  const stop = Math.max(0.05, roundTick(entry - loss));
  const risk = round2(entry - stop);
  if (!(risk > 0)) {
    return blocked("NO_TRADE", "Computed stop is not below entry; risk cannot be defined.");
  }

  const isSpread = candidate.legs.length > 1;
  let cappedAtMaxProfit = false;
  let targetCeiling = Number.POSITIVE_INFINITY;
  if (isSpread) {
    const strikes = candidate.legs.map((l) => l.strike);
    const width = Math.abs(strikes[0] - strikes[1]);
    const maxProfit = width - entry;
    if (!(maxProfit > 0)) {
      return blocked("NO_TRADE", "Spread net debit is not below its width; no profit potential.");
    }
    targetCeiling = entry + SETUP_PARAMS.spreadProfitCapShare * maxProfit;
  }
  const rawTargets = SETUP_PARAMS.targetRMultiples.map((k) => roundTick(entry + k * risk));
  if (rawTargets[0] > targetCeiling) {
    return blocked(
      "NO_TRADE",
      "Spread maximum profit is below one unit of risk; not worth taking.",
    );
  }
  const targets = rawTargets.map((t) => {
    if (t > targetCeiling) {
      cappedAtMaxProfit = true;
      return roundTick(targetCeiling);
    }
    return t;
  });
  const [t1, t2, t3] = targets;

  // Spread cost must be small relative to the risk taken.
  const spreadCost = round2(entry - bidSide);
  const spreadToRisk = round2(spreadCost / risk);
  if (spreadToRisk > SETUP_PARAMS.maxSpreadToRisk) {
    return blocked(
      "NO_TRADE",
      `Bid/ask spread (${spreadCost}) consumes ${(spreadToRisk * 100).toFixed(0)}% of the per-unit risk (${risk}); max ${SETUP_PARAMS.maxSpreadToRisk * 100}%.`,
    );
  }

  // Spot move needed for each target: |d| x + 0.5 g x^2 = k R.
  const spotMoveFor = (reward: number): number | null => {
    if (Math.abs(netGamma) < 1e-9) return reward / absDelta;
    const disc = absDelta * absDelta + 2 * netGamma * reward;
    if (disc < 0) return null;
    const d = (-absDelta + Math.sqrt(disc)) / netGamma;
    return Number.isFinite(d) && d > 0 ? d : null;
  };
  const moves = [t1, t2, t3].map((t) => spotMoveFor(t - entry));
  if (moves.some((m) => m === null)) {
    return blocked("NO_TRADE", "Targets are unreachable under the Greeks model (gamma/delta).");
  }
  const dir = bullish ? 1 : -1;
  const spotTargets = {
    t1: round2(spot + dir * (moves[0] as number)),
    t2: round2(spot + dir * (moves[1] as number)),
    t3: round2(spot + dir * (moves[2] as number)),
  };

  // Support / resistance from real swing points and the open-interest walls.
  const swings = findSwings(bars);
  const resistances = distinctLevels(
    swings.highs.filter((h) => h > spot).sort((a, b) => a - b),
    spot,
  );
  const supports = distinctLevels(
    swings.lows.filter((l) => l < spot).sort((a, b) => b - a),
    spot,
  );
  const pos = analysis.positioning;
  const opposing: number[] = bullish
    ? [
        ...(resistances[0] !== undefined ? [resistances[0]] : []),
        ...(pos.highestCallOiStrike > spot ? [pos.highestCallOiStrike] : []),
      ]
    : [
        ...(supports[0] !== undefined ? [supports[0]] : []),
        ...(pos.highestPutOiStrike < spot ? [pos.highestPutOiStrike] : []),
      ];
  const nearestOpposing = opposing.length
    ? bullish
      ? Math.min(...opposing)
      : Math.max(...opposing)
    : null;
  const room = nearestOpposing === null ? null : round2(Math.abs(nearestOpposing - spot));
  if (room !== null && room < (moves[0] as number)) {
    return blocked(
      "NO_TRADE",
      `Nearest ${bullish ? "resistance" : "support"} at ${nearestOpposing} is only ${room} points away; Target 1 needs a ${round2(moves[0] as number)}-point move.`,
    );
  }

  // 10. Assemble the setup from the real numbers.
  const clean = instrument.replace(/[^A-Z0-9]/g, "");
  const isGlobal = market === "GLOBAL_US";
  const typeWord = isGlobal ? (bullish ? "CALL" : "PUT") : wantType;
  const longLeg = candidate.legs.find((l) => l.action === "BUY") ?? candidate.legs[0];
  const shortLeg = candidate.legs.find((l) => l.action === "SELL");
  const contract = shortLeg
    ? `${clean} ${longLeg.strike}/${shortLeg.strike} ${typeWord} SPREAD`
    : `${clean} ${longLeg.strike} ${typeWord}`;
  const cur = config.currency;
  const atmRow = rowByStrike.get(snap.atmStrike) ?? snap.rows.find((r) => r.isAtm);
  const atmIv = atmRow
    ? round2((atmRow.call.impliedVolatility + atmRow.put.impliedVolatility) / 2)
    : null;

  const trend: ChartTechnicals["trend"] =
    tech.trend === "BULLISH"
      ? bias === "STRONG_BULLISH"
        ? "STRONGLY BULLISH"
        : "BULLISH"
      : tech.trend === "BEARISH"
        ? bias === "STRONG_BEARISH"
          ? "STRONGLY BEARISH"
          : "BEARISH"
        : "RANGEBOUND";

  const closes = bars.map((b) => b.close);
  const ema20 = lastValue(ema(closes, 20));
  const ema50 = lastValue(ema(closes, 50));
  const ema200 = lastValue(ema(closes, 200));
  const st = supertrend(bars, 10, 3);
  const stValue = lastValue(st.value);
  const stDirection = st.direction[st.direction.length - 1];
  const rsi14 = tech.rsi14 ?? lastValue(rsi(closes, 14));
  const vwapNow = tech.vwap;

  const supertrendText =
    stDirection === null || stValue === null
      ? "UNAVAILABLE"
      : `${stDirection === 1 ? "BULLISH" : "BEARISH"} (Supertrend 10,3 line at ${round2(stValue)})`;

  const obs: string[] = [
    `Spot ${round2(spot)}${vwapNow !== null ? ` is ${spot >= vwapNow ? "above" : "below"} VWAP ${vwapNow}` : " (no volume feed: VWAP n/a)"}`,
  ];
  if (ema20 !== null) obs.push(`${spot >= ema20 ? "above" : "below"} EMA20 ${round2(ema20)}`);
  if (rsi14 !== null) obs.push(`RSI14 ${round2(rsi14)}`);
  obs.push(`ATR14 ${round2(atr)} (5-min)`);

  const chartTechnicals: ChartTechnicals = {
    timeframe: `5-min candles (${snap.barsSource}), ${bars.length} bars`,
    trend,
    ema20: ema20 === null ? null : round2(ema20),
    ema50: ema50 === null ? null : round2(ema50),
    ema200: ema200 === null ? null : round2(ema200),
    vwap: vwapNow,
    supertrend: supertrendText,
    rsi14: rsi14 === null ? null : round2(rsi14),
    atr14: round2(atr),
    support1: supports[0] !== undefined ? round2(supports[0]) : null,
    support2: supports[1] !== undefined ? round2(supports[1]) : null,
    resistance1: resistances[0] !== undefined ? round2(resistances[0]) : null,
    resistance2: resistances[1] !== undefined ? round2(resistances[1]) : null,
    chartPattern: swingStructure(swings.highs, swings.lows),
    keyObservation: `${obs.join("; ")}.`,
  };

  const callVol = snap.totalCallVolume;
  const greeksBlock: OptionGreeksAnalysis = {
    atmStrike: snap.atmStrike,
    callDelta: round2(atmRow?.call.delta ?? greeksAnalysis.deltaAnalysis.atmCallDelta),
    putDelta: round2(atmRow?.put.delta ?? greeksAnalysis.deltaAnalysis.atmPutDelta),
    gamma: +netGamma.toFixed(5),
    thetaPerDay: round2(netTheta),
    vega: round2(netVega),
    ivPercentile: null,
    atmIv,
    pcrVolume: callVol > 0 ? round2(snap.totalPutVolume / callVol) : null,
    pcrOpenInterest: round2(snap.pcr),
    maxPainStrike: snap.maxPainStrike,
    oiBuildUpSummary: `OI buildup ${pos.oiBuildup.replace("_", " ").toLowerCase()}; call OI change ${pos.callOiChangeTotal}, put OI change ${pos.putOiChangeTotal}. ${pos.concentrationSummary}.`,
    greeksRecommendation: [
      ...greeksAnalysis.strategySuitability.reasons.slice(0, 2),
      `Theta burn ${greeksAnalysis.thetaAnalysis.thetaBurnSeverity.toLowerCase().replace("_", " ")}; IV regime ${greeksAnalysis.vegaAnalysis.ivRegime.replace("VOLATILITY_", "").toLowerCase()}.`,
    ].join(" "),
  };

  const rr = (t2 - entry) / risk;
  const netEntryLabel = (n: number) => `${cur}${n.toFixed(2)}`;
  const rationale = [
    `${bias.replace("_", " ")} bias (confluence ${analysis.confluenceScore}/100) on ${snap.provider} option chain and ${bars.length} real 5-min candles.`,
    ...candidate.reasonsSupporting.slice(0, 2),
    `Stop ${netEntryLabel(stop)} from ${SETUP_PARAMS.stopAtrMultiple} x ATR(${SETUP_PARAMS.atrPeriod}) = ${round2(riskSpot)} pts adverse move; targets at 1R/2R/3R${cappedAtMaxProfit ? " (capped at spread max profit)" : ""}.`,
    ...(candidate.reasonsAgainst.length
      ? [`Risks: ${candidate.reasonsAgainst.slice(0, 2).join(" ")}`]
      : []),
  ].join(" ");

  const setup: HighProfitTradeSetup = {
    tradeId: `TRADE_${isGlobal ? "GLOBAL" : "NSE"}_${clean}_${longLeg.strike}${typeWord}_${candidate.expiry}${shortLeg ? `_${shortLeg.strike}` : ""}`,
    symbol: instrument,
    market,
    action: "BUY",
    optionType: typeWord,
    contract,
    strategy: `${candidate.strategyType
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())} (expiry ${candidate.expiry})`,
    spotPrice: round2(spot),
    spotEntryTrigger: candidate.entryTrigger,
    premiumEntryRange: `${netEntryLabel(bidSide)} - ${netEntryLabel(entry)}`,
    entryPrice: entry,
    stopLossPrice: stop,
    target1: t1,
    target2: t2,
    target3: t3,
    riskRewardRatio: `1 : ${rr.toFixed(1)}`,
    expectedProfitPctT2: `+${(((t2 - entry) / entry) * 100).toFixed(1)}%`,
    lotSize: config.lotSize,
    currency: cur,
    timing: getMarketTiming(market, nowMs),
    chartTechnicals,
    greeks: greeksBlock,
    geopolitics: macro ?? {
      available: false,
      source: "unavailable",
      asOf: null,
      indicators: [],
      summary: "Macro context unavailable (no market-wide quotes could be fetched).",
    },
    bestProfitRationale: rationale,
    createdAt: generatedAt,
    dataQuality: buildQuality(state, nowMs, macro),
    isSimulated: false,
    dataSource: `${snap.provider} option chain (${snap.dataSource}) + ${snap.barsSource} candles`,
    generatedAt,
    expiry: candidate.expiry,
    calculation: {
      formulas: [
        "entry = sum(ask of BUY legs) - sum(bid of SELL legs)",
        `riskSpot = ${SETUP_PARAMS.stopAtrMultiple} x ATR(${SETUP_PARAMS.atrPeriod}) of 5-min candles`,
        "loss = |netDelta| x riskSpot - 0.5 x netGamma x riskSpot^2, clamped to 8%-45% of entry",
        "stop = entry - loss; R = entry - stop; T1/T2/T3 = entry + 1R/2R/3R (spreads capped at 90% of max profit)",
        "spot move for target k solves |netDelta| d + 0.5 netGamma d^2 = k R (theta/IV not modelled)",
      ],
      atr14: round2(atr),
      riskSpotPoints: round2(riskSpot),
      netDelta: round2(netDelta),
      netGamma: +netGamma.toFixed(5),
      premiumRiskPerUnit: risk,
      spreadToRiskRatio: spreadToRisk,
      spotTargets,
      nearestOpposingLevel: nearestOpposing,
      roomToOpposingLevelPoints: room,
      cappedAtMaxProfit,
      entryBasis: "ASK (buy legs) / BID (sell legs)",
    },
    conviction: {
      setupScore: candidate.setupScore,
      confluenceScore: analysis.confluenceScore,
      marketBias: bias,
      tradeScore: score
        ? {
            overall: score.overallScore,
            confidence: score.confidenceLevel,
            dataCoverage: score.dataCoverage,
            scoreCap: score.scoreCap,
          }
        : null,
    },
  };

  return {
    instrument,
    market,
    status: "SETUP_AVAILABLE",
    reason: "Setup derived from live option chain, real candles and engine gates.",
    reasons: [],
    setup,
    dataQuality: setup.dataQuality as SetupDataQuality,
    generatedAt,
  };
}

/** Result for an instrument whose engine state could not be loaded at all. */
export function unavailableSetupResult(
  instrument: string,
  market: TradeMarket,
  reason: string,
  nowMs: number = Date.now(),
): TradeSetupResult {
  return {
    instrument,
    market,
    status: "DATA_UNAVAILABLE",
    reason,
    reasons: [reason],
    setup: null,
    dataQuality: emptyQuality([reason]),
    generatedAt: new Date(nowMs).toISOString(),
  };
}

/** Order in which blocker statuses are surfaced when no instrument yields a setup. */
const STATUS_PRIORITY: SetupStatus[] = [
  "MARKET_CLOSED",
  "DATA_UNAVAILABLE",
  "DATA_SIMULATED",
  "DATA_STALE",
  "DATA_DELAYED",
  "NO_TRADE",
];

/** Combine per-instrument results into one market-level result. */
export function summarizeMarketSetups(
  market: TradeMarket,
  perInstrument: TradeSetupResult[],
  macro: MacroBackdrop | null,
  nowMs: number = Date.now(),
): MarketSetupsResult {
  const setups = perInstrument.flatMap((r) => (r.setup ? [r.setup] : []));
  const timing = getMarketTiming(market, nowMs);
  const generatedAt = new Date(nowMs).toISOString();
  const first = perInstrument[0];
  const dataQuality = (setups[0]?.dataQuality ??
    first?.dataQuality ??
    emptyQuality([])) as SetupDataQuality;
  dataQuality.macro = macro?.available ? "REAL" : dataQuality.macro;

  if (setups.length > 0) {
    return {
      market,
      status: "SETUP_AVAILABLE",
      reason: `${setups.length} setup(s) derived from live data.`,
      setups,
      perInstrument,
      dataQuality,
      macro,
      timing,
      generatedAt,
    };
  }
  const blocker =
    STATUS_PRIORITY.map((s) => perInstrument.find((r) => r.status === s)).find(Boolean) ?? first;
  return {
    market,
    status: blocker?.status ?? "DATA_UNAVAILABLE",
    reason: blocker?.reason ?? "No instruments were evaluated.",
    setups: [],
    perInstrument,
    dataQuality: blocker?.dataQuality ?? dataQuality,
    macro,
    timing,
    generatedAt,
  };
}

const normName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** True when every evaluated instrument reports its data layer as unavailable. */
export function isDataLayerDown(result: MarketSetupsResult): boolean {
  return (
    result.perInstrument.length > 0 &&
    result.perInstrument.every((r) => r.status === "DATA_UNAVAILABLE")
  );
}

/**
 * Pick the setup to act on: the requested symbol's setup, or (without a symbol) the one with the
 * highest conviction. When none exists the blocker's status and reason are returned instead.
 */
export function selectSetup(
  result: MarketSetupsResult,
  symbol?: string | null,
): { setup: HighProfitTradeSetup | null; status: SetupStatus; reason: string } {
  if (symbol) {
    const want = normName(symbol);
    const setup = result.setups.find((s) => normName(s.symbol) === want) ?? null;
    if (setup) return { setup, status: "SETUP_AVAILABLE", reason: result.reason };
    const per = result.perInstrument.find((r) => normName(r.instrument) === want);
    return {
      setup: null,
      status: per?.status ?? "NO_TRADE",
      reason: per?.reason ?? `No setup is available for '${symbol}' in this market.`,
    };
  }
  const conviction = (s: HighProfitTradeSetup) =>
    s.conviction?.tradeScore?.overall ?? s.conviction?.setupScore ?? 0;
  const best = [...result.setups].sort((a, b) => conviction(b) - conviction(a))[0] ?? null;
  if (best) return { setup: best, status: "SETUP_AVAILABLE", reason: result.reason };
  return { setup: null, status: result.status, reason: result.reason };
}
