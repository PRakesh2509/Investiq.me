import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  aggregateBars,
  getInstrumentBars,
  getInstrumentQuote,
} from "./market-data-provider.server.ts";
import { isMarketOpenAt, type FreshnessStatus } from "./provider-utils.ts";

export interface OptionStrikeRow {
  strike: number;
  callLtp: number;
  callType: "ITM" | "OTM" | "ATM";
  putLtp: number;
  putType: "ITM" | "OTM" | "ATM";
  isAtm?: boolean;
}

export interface ConfluenceSignalItem {
  id: string;
  type: "BUY PE" | "BUY CE";
  timeStr: string;
  spot: number;
  rationale: string;
  target: number;
  stop: number;
  status: "TARGET HIT" | "STOP HIT" | "ACTIVE";
  pnlPoints: number;
}

export interface TerminalWorkstationData {
  ok: boolean;
  instrument: string;
  name: string;
  tag: string;
  tvSymbol: string;
  spotPrice: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  lotSize: number;
  step: number;
  currency: string;
  isMarketOpen: boolean;
  marketSessionText: string;
  // AI Confluence Setup
  direction: "PUT" | "CALL";
  actionText: string;
  grade: string;
  confidenceScore: number; // e.g. 94%
  rationale: string;
  contractName: string;
  spotEntry: number;
  recommendedPremium: number;
  tp1: number;
  tp2: number;
  stopLoss: number;
  trailingSl: number;
  peakWatermark: number;
  trailingStatus: string;
  // Option Chain
  strikes: OptionStrikeRow[];
  // Recent Signals & Backtest Stats
  recentSignals: ConfluenceSignalItem[];
  winRatePct: number;
  profitFactor: number;
  totalSignalsTracked: number;
  /**
   * Data-provenance fields (optional so older consumers keep compiling).
   * isSimulated is false for real quotes (nothing in this payload is generated any more).
   * dataSource names the feed ("dhan", "yahoo", "yahoo-cache", "unavailable"). freshnessStatus mirrors the option-chain vocabulary.
   */
  isSimulated?: boolean;
  dataSource?: string;
  freshnessStatus?: FreshnessStatus;
  /** Epoch ms of the underlying market data point (not of this response). */
  asOf?: number;
  /** Always-present caveats, e.g. strike LTPs are model estimates. */
  dataQualityNotes?: string[];
}

/** Provenance a caller can attach to computeTerminalData output. */
export interface TerminalDataQuality {
  isSimulated?: boolean;
  dataSource?: string;
  freshnessStatus?: FreshnessStatus;
  asOf?: number;
  notes?: string[];
}

export const WORKSTATION_INSTRUMENTS: Record<
  string,
  {
    name: string;
    tag: string;
    yahooSymbol: string;
    tvSymbol: string;
    lotSize: number;
    step: number;
    currency: string;
    isGlobal?: boolean;
    defaultSpot: number;
  }
> = {
  "NIFTY 50": {
    name: "Nifty 50",
    tag: "^NSEI",
    yahooSymbol: "^NSEI",
    tvSymbol: "NSE:NIFTY",
    lotSize: 25,
    step: 50,
    currency: "₹",
    defaultSpot: 22862.9,
  },
  "BANK NIFTY": {
    name: "Bank Nifty",
    tag: "^NSEBANK",
    yahooSymbol: "^NSEBANK",
    tvSymbol: "NSE:BANKNIFTY",
    lotSize: 15,
    step: 100,
    currency: "₹",
    defaultSpot: 51240.0,
  },
  "FIN NIFTY": {
    name: "Fin Nifty",
    tag: "NIFTY_FIN_SERVICE",
    yahooSymbol: "NIFTY_FIN_SERVICE.NS",
    tvSymbol: "NSE:CNXFINANCE",
    lotSize: 25,
    step: 50,
    currency: "₹",
    defaultSpot: 23680.0,
  },
  SENSEX: {
    name: "Sensex",
    tag: "^BSESN",
    yahooSymbol: "^BSESN",
    tvSymbol: "BSE:SENSEX",
    lotSize: 10,
    step: 100,
    currency: "₹",
    defaultSpot: 75210.0,
  },
  "MIDCAP NIFTY": {
    name: "Midcap Nifty",
    tag: "NIFTY_MIDCAP_100",
    yahooSymbol: "NIFTY_MIDCAP_100.NS",
    tvSymbol: "NSE:MIDCPNIFTY",
    lotSize: 50,
    step: 25,
    currency: "₹",
    defaultSpot: 12450.0,
  },
  "S&P 500": {
    name: "S&P 500",
    tag: "ES=F",
    yahooSymbol: "ES=F",
    tvSymbol: "FOREXCOM:SPXUSD",
    lotSize: 1,
    step: 10,
    currency: "$",
    isGlobal: true,
    defaultSpot: 5865.0,
  },
  "NASDAQ 100": {
    name: "Nasdaq 100",
    tag: "NQ=F",
    yahooSymbol: "NQ=F",
    tvSymbol: "FOREXCOM:NAS100",
    lotSize: 1,
    step: 25,
    currency: "$",
    isGlobal: true,
    defaultSpot: 20450.0,
  },
  "DOW JONES": {
    name: "Dow Jones",
    tag: "YM=F",
    yahooSymbol: "YM=F",
    tvSymbol: "FOREXCOM:DJI",
    lotSize: 1,
    step: 50,
    currency: "$",
    isGlobal: true,
    defaultSpot: 42800.0,
  },
};

export const INSTRUMENT_PROFILES: Record<
  string,
  {
    baseChange: number;
    baseChangePct: number;
    baseRsi: number;
    bias: "CALL" | "PUT";
    grade: string;
    baseConfidence: number;
    rationale: string;
    winRate: number;
    profitFactor: number;
    signals: number;
  }
> = {
  "NIFTY 50": {
    baseChange: -38.4,
    baseChangePct: -0.17,
    baseRsi: 46.2,
    bias: "PUT",
    grade: "A CONFLUENCE",
    baseConfidence: 84,
    rationale: "EMA9<EMA21 crossdown · Multi-Pivot S1 retest · Moderate put writing absorption",
    winRate: 78.4,
    profitFactor: 2.15,
    signals: 148,
  },
  "BANK NIFTY": {
    baseChange: 185.6,
    baseChangePct: 0.36,
    baseRsi: 59.8,
    bias: "CALL",
    grade: "A+ CONFLUENCE",
    baseConfidence: 91,
    rationale: "Banking index CPR breakout · EMA9>EMA21 expansion · Institutional call volume",
    winRate: 82.5,
    profitFactor: 2.65,
    signals: 164,
  },
  "FIN NIFTY": {
    baseChange: 52.1,
    baseChangePct: 0.22,
    baseRsi: 54.1,
    bias: "CALL",
    grade: "A CONFLUENCE",
    baseConfidence: 86,
    rationale: "NBFC support floor holding · VWAP reclaim · Low volatility base breakout",
    winRate: 79.2,
    profitFactor: 2.3,
    signals: 112,
  },
  SENSEX: {
    baseChange: -115.3,
    baseChangePct: -0.15,
    baseRsi: 48.0,
    bias: "PUT",
    grade: "B+ CONFLUENCE",
    baseConfidence: 81,
    rationale: "Heavyweight consolidation · S1 pivot friction · Call writers defending resistance",
    winRate: 76.5,
    profitFactor: 2.05,
    signals: 135,
  },
  "MIDCAP NIFTY": {
    baseChange: 84.2,
    baseChangePct: 0.68,
    baseRsi: 66.4,
    bias: "CALL",
    grade: "A+ CONFLUENCE",
    baseConfidence: 93,
    rationale: "High-beta midcap trend continuation · Supertrend bullish · Strong market breadth",
    winRate: 84.1,
    profitFactor: 2.9,
    signals: 98,
  },
  "S&P 500": {
    baseChange: 14.25,
    baseChangePct: 0.24,
    baseRsi: 57.2,
    bias: "CALL",
    grade: "A CONFLUENCE",
    baseConfidence: 89,
    rationale: "Broad market institutional accumulation · S&P holding above 50-day EMA support",
    winRate: 81.0,
    profitFactor: 2.45,
    signals: 190,
  },
  "NASDAQ 100": {
    baseChange: 165.8,
    baseChangePct: 0.81,
    baseRsi: 68.5,
    bias: "CALL",
    grade: "A+ CONFLUENCE",
    baseConfidence: 95,
    rationale: "Mega-cap tech momentum expansion · Semiconductor volume surge · CBOE call skew",
    winRate: 86.2,
    profitFactor: 3.1,
    signals: 210,
  },
  "DOW JONES": {
    baseChange: 51.3,
    baseChangePct: 0.12,
    baseRsi: 52.1,
    bias: "CALL",
    grade: "A CONFLUENCE",
    baseConfidence: 85,
    rationale: "Value & industrial cyclical consolidation · CBOE Put-Call Ratio at 0.92 balanced",
    winRate: 77.8,
    profitFactor: 2.2,
    signals: 175,
  },
};

/**
 * Builds the terminal payload from a REAL quote. There is no synthetic fallback: without a
 * `spotParam` (i.e. no real quote) the result is `ok: false` with zeroed numbers and an
 * explanation in `dataQualityNotes`. The confluence / option-premium / signal-history fields are
 * not computed server-side any more (they were derived from static profiles); they are returned
 * empty so nothing invented reaches the UI.
 *
 * @deprecated Prefer {@link getTerminalSnapshot}; kept exported for existing API routes.
 */
export function computeTerminalData(
  instrument: string,
  spotParam?: number,
  changeParam?: number,
  changePctParam?: number,
  metaParam?: { open?: number; high?: number; low?: number; volume?: number },
  quality?: TerminalDataQuality,
): TerminalWorkstationData {
  const cfg = WORKSTATION_INSTRUMENTS[instrument] ?? WORKSTATION_INSTRUMENTS["NIFTY 50"];
  const hasQuote = typeof spotParam === "number" && Number.isFinite(spotParam) && spotParam > 0;
  const spot = hasQuote ? spotParam : 0;
  const change = hasQuote ? (changeParam ?? 0) : 0;
  const changePct = hasQuote ? (changePctParam ?? 0) : 0;

  const now = new Date();
  const isMarketOpen = isMarketOpenAt(now, Boolean(cfg.isGlobal));
  const marketSessionText = cfg.isGlobal
    ? isMarketOpen
      ? "GLOBAL DERIVATIVES ACTIVE"
      : "GLOBAL MARKET CLOSED"
    : isMarketOpen
      ? "SESSION LIVE · CLOSES 3:30 PM IST"
      : "MARKET CLOSED · NEXT SESSION 9:15 AM IST";

  const direction: "PUT" | "CALL" = change < 0 ? "PUT" : "CALL";
  return {
    ok: hasQuote,
    instrument,
    name: cfg.name,
    tag: cfg.tag,
    tvSymbol: cfg.tvSymbol,
    spotPrice: spot,
    change,
    changePct,
    open: metaParam?.open ?? spot,
    high: metaParam?.high ?? spot,
    low: metaParam?.low ?? spot,
    volume: metaParam?.volume ?? 0,
    lotSize: cfg.lotSize,
    step: cfg.step,
    currency: cfg.currency,
    isMarketOpen,
    marketSessionText,
    direction,
    actionText: "",
    grade: "UNRATED",
    confidenceScore: 0,
    rationale: "",
    contractName: "",
    spotEntry: spot,
    recommendedPremium: 0,
    tp1: 0,
    tp2: 0,
    stopLoss: 0,
    trailingSl: 0,
    peakWatermark: 0,
    trailingStatus: "",
    strikes: [],
    recentSignals: [],
    winRatePct: 0,
    profitFactor: 0,
    totalSignalsTracked: 0,
    isSimulated: false,
    dataSource: quality?.dataSource ?? (hasQuote ? "unknown" : "unavailable"),
    freshnessStatus: quality?.freshnessStatus ?? "STALE",
    asOf: quality?.asOf,
    dataQualityNotes: [
      ...(hasQuote
        ? []
        : ["No real quote is available from DhanHQ or Yahoo Finance; nothing was substituted."]),
      "Signals, option premiums and win-rate are not computed here; use the F&O intelligence endpoints.",
      ...(quality?.notes ?? []),
    ],
  };
}

/** Real-quote snapshot for a configured instrument (server-side helper, not a server fn). */
export async function getTerminalSnapshot(instrument: string): Promise<TerminalWorkstationData> {
  const key = Object.prototype.hasOwnProperty.call(WORKSTATION_INSTRUMENTS, instrument)
    ? instrument
    : "NIFTY 50";
  const cfg = WORKSTATION_INSTRUMENTS[key];
  const quote = await getInstrumentQuote({
    yahooSymbol: cfg.yahooSymbol,
    dhanSymbol: dhanKeyFor(key),
    isGlobal: Boolean(cfg.isGlobal),
  });
  if (!quote) {
    return computeTerminalData(key, undefined, undefined, undefined, undefined, {
      isSimulated: false,
      dataSource: "unavailable",
      freshnessStatus: "STALE",
    });
  }
  return computeTerminalData(
    key,
    quote.price,
    quote.change,
    quote.changePct,
    { open: quote.open, high: quote.high, low: quote.low, volume: quote.volume },
    {
      isSimulated: false,
      dataSource: quote.source,
      freshnessStatus: quote.freshnessStatus,
      asOf: quote.asOfMs,
      notes:
        quote.source === "yahoo-cache"
          ? ["Providers unreachable: showing the last real quote held in cache."]
          : quote.source === "yahoo"
            ? ["Yahoo Finance quotes can be delayed."]
            : [],
    },
  );
}

/** Instrument must be one of the configured workstation instruments (no free-form input). */
const InstrumentSchema = z
  .string()
  .max(32)
  .refine((k) => Object.prototype.hasOwnProperty.call(WORKSTATION_INSTRUMENTS, k), {
    message: "Unknown instrument",
  });

/** DhanHQ lookup key for Indian instruments; global instruments never go through Dhan. */
function dhanKeyFor(instrument: string): string | undefined {
  const cfg = WORKSTATION_INSTRUMENTS[instrument];
  if (!cfg || cfg.isGlobal) return undefined;
  return instrument;
}

/**
 * Live terminal snapshot. Spot/change/OHLC come from a real quote (DhanHQ, then Yahoo Finance).
 * If neither is reachable the last cached real quote is returned (freshnessStatus STALE or
 * MARKET_CLOSED). If there has never been a real quote, the result is `ok: false` with zeroed
 * numbers and a reason in dataQualityNotes. Prices are never invented or randomised.
 */
export const getTerminalMarketData = createServerFn({ method: "GET" })
  .validator((d) => z.object({ instrument: InstrumentSchema.default("NIFTY 50") }).parse(d))
  .handler(async ({ data }): Promise<TerminalWorkstationData> =>
    getTerminalSnapshot(data.instrument),
  );

export interface WorkstationBar {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TF_API_MAP: Record<
  string,
  { interval: string; range: string; dhanRange?: string; dhanMinutes?: number }
> = {
  "1M": { interval: "1m", range: "1d", dhanRange: "1d", dhanMinutes: 1 },
  "3M": { interval: "1m", range: "2d" },
  "5M": { interval: "5m", range: "5d", dhanRange: "5d", dhanMinutes: 5 },
  "15M": { interval: "15m", range: "5d", dhanRange: "5d", dhanMinutes: 15 },
  "30M": { interval: "30m", range: "1mo" },
  "1H": { interval: "60m", range: "1mo", dhanRange: "1mo", dhanMinutes: 60 },
  "1D": { interval: "1d", range: "1y", dhanRange: "1y" },
};

export interface TerminalBarsResult {
  ok: boolean;
  bars: WorkstationBar[];
  /** Always false for real bars; bars are never synthesised server-side. */
  isSimulated?: boolean;
  dataSource?: string;
  freshnessStatus?: FreshnessStatus;
  asOf?: number;
  dataQualityNotes?: string[];
}

/**
 * Real OHLCV bars (DhanHQ for Indian instruments, Yahoo Finance otherwise). When nothing real is
 * reachable the response is `ok: false` with empty bars rather than a generated series.
 */
export const getTerminalBars = createServerFn({ method: "GET" })
  .validator((d) =>
    z
      .object({
        instrument: InstrumentSchema.default("NIFTY 50"),
        timeframe: z.enum(["1M", "3M", "5M", "15M", "30M", "1H", "1D"]).default("1M"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<TerminalBarsResult> => {
    const cfg = WORKSTATION_INSTRUMENTS[data.instrument];
    const tf = TF_API_MAP[data.timeframe];
    const dhanKey = dhanKeyFor(data.instrument);

    const result = await getInstrumentBars({
      yahooSymbol: cfg.yahooSymbol,
      interval: tf.interval,
      range: tf.range,
      isGlobal: Boolean(cfg.isGlobal),
      dhan:
        dhanKey && tf.dhanRange
          ? { symbol: dhanKey, range: tf.dhanRange, minutes: tf.dhanMinutes }
          : undefined,
    });

    if (!result || result.bars.length < 2) {
      return {
        ok: false,
        bars: [],
        isSimulated: false,
        dataSource: "unavailable",
        freshnessStatus: "STALE",
        dataQualityNotes: ["No real bars available from DhanHQ or Yahoo Finance."],
      };
    }

    const rounded: WorkstationBar[] = result.bars.map((b) => ({
      time: b.time,
      open: +b.open.toFixed(2),
      high: +b.high.toFixed(2),
      low: +b.low.toFixed(2),
      close: +b.close.toFixed(2),
      volume: Math.floor(b.volume),
    }));
    // 3M is built by folding three 1-minute bars together.
    const bars = (data.timeframe === "3M" ? aggregateBars(rounded, 3) : rounded).slice(-150);

    return {
      ok: true,
      bars,
      isSimulated: false,
      dataSource: result.source,
      freshnessStatus: result.freshnessStatus,
      asOf: result.asOfMs,
      dataQualityNotes:
        result.source === "yahoo-cache"
          ? ["Providers unreachable: showing the last real bars held in cache."]
          : [],
    };
  });
