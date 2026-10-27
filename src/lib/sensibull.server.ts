/**
 * Greeks View Chart service (`fetchSensibullGreeksChartData`)
 *
 * Builds the Delta / Gamma / Theta / Vega / IV-smile curves used by the Greeks View chart.
 *
 * COMPLIANCE: this module does NOT read Sensibull cookies, session tokens or access tokens and
 * never calls Sensibull's private endpoints. The only Sensibull path is an authorized enterprise
 * partner integration (SENSIBULL_PARTNER_API_KEY, SENSIBULL_PARTNER_SECRET and
 * SENSIBULL_PARTNER_API_BASE_URL, all three required). Without them the chart is driven by
 * authorized broker data instead and `sensibullStatus` explains why Sensibull is unavailable.
 *
 * Source order for each call:
 *   1. Authorized Sensibull partner API (only when fully configured, Indian underlyings)
 *   2. The real normalized option chain (DhanHQ -> Upstox -> global feed): provider IV/Greeks
 *   3. Only when ALLOW_MOCK_DATA === "true": theoretical Black-Scholes curves around the real spot
 *      (flagged isSimulated: true; the IV smile is an assumed parametric shape, not market IV)
 *   4. Otherwise an empty, unavailable result with `dataQualityNotes` (no invented numbers)
 */

import { calculateGreeks, calculateTimeToExpiryYears } from "./greeks-service.ts";
import { WORKSTATION_INSTRUMENTS } from "./terminal-workstation.functions.ts";
import {
  getNormalizedOptionChain,
  getSensibullAuthorizationStatus,
  getSensibullPartnerConfig,
  type ProviderStatusInfo,
} from "./options-data-provider.server.ts";
import { getInstrumentQuote } from "./market-data-provider.server.ts";
import { parseSensibullPartnerGreeks } from "./provider-parsers.ts";
import {
  TtlCache,
  allowMockData,
  fetchJsonWithRetry,
  isValidExpiry,
  nextThursdayISO,
  safeErrorMessage,
  type FreshnessStatus,
} from "./provider-utils.ts";

export interface SensibullGreekPoint {
  strike: number;
  callDelta: number;
  putDelta: number;
  callGamma: number;
  putGamma: number;
  callTheta: number; // ₹/day
  putTheta: number; // ₹/day
  callVega: number; // ₹/1% IV
  putVega: number; // ₹/1% IV
  callIv: number; // %
  putIv: number; // %
  callLtp: number;
  putLtp: number;
  isAtm: boolean;
  isItmCall: boolean;
  isItmPut: boolean;
}

export interface SensibullGreeksChartData {
  symbol: string;
  underlyingPrice: number;
  expiryDate: string;
  atmStrike: number;
  daysToExpiry: number;
  /**
   * Legacy display labels (kept for compatibility). Prefer `dataSource` for the truth: only
   * "Sensibull Direct API" means Sensibull data, and only with partner credentials.
   */
  provider:
    | "Sensibull Direct API"
    | "Sensibull Greeks Engine (Calibrated Live Feed)"
    | "CBOE / CME Global Feed";
  dataSourceStatus: "LIVE_CONNECTED" | "CALIBRATED_ENGINE";
  timestamp: string;
  points: SensibullGreekPoint[];
  summary: {
    atmCallDelta: number;
    atmPutDelta: number;
    peakGamma: number;
    peakGammaStrike: number;
    maxThetaBurn: number;
    maxThetaStrike: number;
    atmIv: number;
  };
  /** True when the curves are model-generated (ALLOW_MOCK_DATA) rather than from a real chain. */
  isSimulated?: boolean;
  /** Plain-language origin, e.g. "dhan option chain", "sensibull partner api", "black-scholes model". */
  dataSource?: string;
  freshnessStatus?: FreshnessStatus;
  dataQualityNotes?: string[];
  /** True when no data could be produced; `points` is empty. */
  unavailable?: boolean;
  /** Why Sensibull itself is / is not the source. */
  sensibullStatus?: ProviderStatusInfo;
}

const STRIKES_EACH_SIDE = 10;
const partnerCache = new TtlCache<SensibullGreeksChartData>(20);
const PARTNER_TTL_MS = 5_000;

function summarize(points: SensibullGreekPoint[], spot: number, step: number) {
  const atmPoint = points.find((p) => p.isAtm) ?? points[Math.floor(points.length / 2)];
  let peakGamma = 0;
  let peakGammaStrike = atmPoint?.strike ?? Math.round(spot / step) * step;
  let maxThetaBurn = 0;
  let maxThetaStrike = peakGammaStrike;
  for (const p of points) {
    if (p.callGamma > peakGamma) {
      peakGamma = p.callGamma;
      peakGammaStrike = p.strike;
    }
    const burn = Math.abs(p.callTheta);
    if (burn > maxThetaBurn) {
      maxThetaBurn = burn;
      maxThetaStrike = p.strike;
    }
  }
  return {
    atmPoint,
    summary: {
      atmCallDelta: atmPoint?.callDelta ?? 0,
      atmPutDelta: atmPoint?.putDelta ?? 0,
      peakGamma: +peakGamma.toFixed(4),
      peakGammaStrike,
      maxThetaBurn: +maxThetaBurn.toFixed(1),
      maxThetaStrike,
      atmIv: atmPoint?.callIv ?? 0,
    },
  };
}

function emptyResult(
  symbol: string,
  expiryDate: string,
  isGlobal: boolean,
  notes: string[],
  sensibullStatus: ProviderStatusInfo,
): SensibullGreeksChartData {
  return {
    symbol,
    underlyingPrice: 0,
    expiryDate,
    atmStrike: 0,
    daysToExpiry: 0,
    provider: isGlobal
      ? "CBOE / CME Global Feed"
      : "Sensibull Greeks Engine (Calibrated Live Feed)",
    dataSourceStatus: "CALIBRATED_ENGINE",
    timestamp: new Date().toISOString(),
    points: [],
    summary: {
      atmCallDelta: 0,
      atmPutDelta: 0,
      peakGamma: 0,
      peakGammaStrike: 0,
      maxThetaBurn: 0,
      maxThetaStrike: 0,
      atmIv: 0,
    },
    isSimulated: false,
    dataSource: "unavailable",
    freshnessStatus: "STALE",
    dataQualityNotes: notes,
    unavailable: true,
    sensibullStatus,
  };
}

/** Authorized Sensibull partner API. Returns null on any failure so the caller can fall back. */
async function fetchPartnerGreeks(
  cleanSym: string,
  expiryDate: string,
  spot: number,
  step: number,
  daysToExpiry: number,
  status: ProviderStatusInfo,
): Promise<SensibullGreeksChartData | null> {
  const cfg = getSensibullPartnerConfig();
  if (!cfg) return null;
  const cacheKey = `${cleanSym}|${expiryDate}`;
  const hit = partnerCache.get(cacheKey, PARTNER_TTL_MS);
  if (hit) return hit;

  const path = process.env.SENSIBULL_PARTNER_GREEKS_PATH?.trim() || "/greeks";
  const url = `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}?underlying=${encodeURIComponent(
    cleanSym,
  )}&expiry=${encodeURIComponent(expiryDate)}`;
  try {
    const res = await fetchJsonWithRetry(
      url,
      {
        headers: {
          Accept: "application/json",
          "X-API-Key": cfg.apiKey,
          "X-API-Secret": cfg.apiSecret,
        },
      },
      { timeoutMs: 6000, retries: 1 },
    );
    if (!res.ok) return null;
    const rows = parseSensibullPartnerGreeks(res.json);
    if (rows.length === 0) return null;

    const points: SensibullGreekPoint[] = rows.map((r) => ({
      strike: r.strike,
      callDelta: +r.callDelta.toFixed(3),
      putDelta: +r.putDelta.toFixed(3),
      callGamma: +r.callGamma.toFixed(4),
      putGamma: +r.putGamma.toFixed(4),
      callTheta: +r.callTheta.toFixed(1),
      putTheta: +r.putTheta.toFixed(1),
      callVega: +r.callVega.toFixed(1),
      putVega: +r.putVega.toFixed(1),
      callIv: +r.callIv.toFixed(1),
      putIv: +r.putIv.toFixed(1),
      callLtp: +r.callLtp.toFixed(2),
      putLtp: +r.putLtp.toFixed(2),
      isAtm: Math.abs(r.strike - spot) <= step / 2,
      isItmCall: r.strike < spot,
      isItmPut: r.strike > spot,
    }));
    const { atmPoint, summary } = summarize(points, spot, step);
    const out: SensibullGreeksChartData = {
      symbol: cleanSym,
      underlyingPrice: spot,
      expiryDate,
      atmStrike: atmPoint?.strike ?? Math.round(spot / step) * step,
      daysToExpiry,
      provider: "Sensibull Direct API",
      dataSourceStatus: "LIVE_CONNECTED",
      timestamp: new Date().toISOString(),
      points,
      summary,
      isSimulated: false,
      dataSource: "sensibull partner api",
      freshnessStatus: "LIVE",
      dataQualityNotes: ["Data from the authorized Sensibull partner API."],
      sensibullStatus: status,
    };
    partnerCache.set(cacheKey, out);
    return out;
  } catch (e) {
    console.warn(
      "[Sensibull partner] unavailable, falling back to broker data:",
      safeErrorMessage(e, "request failed", [cfg.apiKey, cfg.apiSecret]),
    );
    return null;
  }
}

/**
 * Fetch Greeks View Chart data. See the file header for the source order.
 */
export async function fetchSensibullGreeksChartData(
  instrument: string = "NIFTY 50",
  customExpiry?: string,
): Promise<SensibullGreeksChartData> {
  const key = Object.prototype.hasOwnProperty.call(WORKSTATION_INSTRUMENTS, instrument)
    ? instrument
    : "NIFTY 50";
  const cfg = WORKSTATION_INSTRUMENTS[key];
  const cleanSym = key.replace(/[^A-Z0-9]/g, "").toUpperCase();
  const step = cfg.step || 50;
  const isGlobal = Boolean(cfg.isGlobal);
  const sensibullStatus = getSensibullAuthorizationStatus();

  const requestedExpiry = customExpiry && isValidExpiry(customExpiry) ? customExpiry : undefined;
  const notes: string[] = [];
  if (customExpiry && !requestedExpiry)
    notes.push("Ignored malformed expiry (expected YYYY-MM-DD).");

  // 1. Authorized Sensibull partner API (Indian underlyings only).
  if (!isGlobal && getSensibullPartnerConfig()) {
    const expiryGuess = requestedExpiry ?? nextThursdayISO();
    const tY = calculateTimeToExpiryYears(expiryGuess);
    const quote = await getInstrumentQuote({ yahooSymbol: cfg.yahooSymbol, dhanSymbol: key });
    if (quote) {
      const partner = await fetchPartnerGreeks(
        cleanSym,
        expiryGuess,
        quote.price,
        step,
        Math.max(0.1, +(tY * 365).toFixed(1)),
        sensibullStatus,
      );
      if (partner) return partner;
    }
    notes.push("Sensibull partner API did not return data; using authorized broker data.");
  }

  // 2. Real option chain (DhanHQ -> Upstox -> global feed).
  const chain = await getNormalizedOptionChain(key, requestedExpiry);
  if (!chain.unavailable && !chain.isSimulated && chain.rows.length > 0) {
    const sorted = [...chain.rows].sort((a, b) => a.strike - b.strike);
    const atmIdx = Math.max(
      0,
      sorted.findIndex((r) => r.strike === chain.atmStrike),
    );
    const slice = sorted.slice(
      Math.max(0, atmIdx - STRIKES_EACH_SIDE),
      Math.min(sorted.length, atmIdx + STRIKES_EACH_SIDE + 1),
    );
    const spot = chain.underlyingPrice;
    const points: SensibullGreekPoint[] = slice.map((r) => ({
      strike: r.strike,
      callDelta: +r.call.delta.toFixed(3),
      putDelta: +r.put.delta.toFixed(3),
      callGamma: +r.call.gamma.toFixed(4),
      putGamma: +r.put.gamma.toFixed(4),
      callTheta: +r.call.theta.toFixed(1),
      putTheta: +r.put.theta.toFixed(1),
      callVega: +r.call.vega.toFixed(1),
      putVega: +r.put.vega.toFixed(1),
      callIv: +r.call.impliedVolatility.toFixed(1),
      putIv: +r.put.impliedVolatility.toFixed(1),
      callLtp: +r.call.ltp.toFixed(2),
      putLtp: +r.put.ltp.toFixed(2),
      isAtm: r.strike === chain.atmStrike,
      isItmCall: r.strike < spot,
      isItmPut: r.strike > spot,
    }));
    const { summary } = summarize(points, spot, step);
    return {
      symbol: cleanSym,
      underlyingPrice: spot,
      expiryDate: chain.expiryDate,
      atmStrike: chain.atmStrike,
      daysToExpiry: +chain.daysToExpiry.toFixed(1),
      provider: isGlobal
        ? "CBOE / CME Global Feed"
        : "Sensibull Greeks Engine (Calibrated Live Feed)",
      dataSourceStatus: "LIVE_CONNECTED",
      timestamp: new Date().toISOString(),
      points,
      summary,
      isSimulated: false,
      dataSource: `${chain.provider} option chain`,
      freshnessStatus: chain.freshnessStatus,
      dataQualityNotes: [
        "Greeks and IV come from the authorized broker/global option chain, not from Sensibull.",
        ...notes,
        ...chain.dataQualityNotes,
      ],
      sensibullStatus,
    };
  }

  // 3. Theoretical curves: only with the explicit mock flag.
  const expiryDate = requestedExpiry ?? nextThursdayISO();
  if (!allowMockData()) {
    return emptyResult(
      cleanSym,
      expiryDate,
      isGlobal,
      [
        `No real option chain is available for ${cleanSym}, so no Greeks were produced.`,
        ...notes,
        ...chain.dataQualityNotes,
      ],
      sensibullStatus,
    );
  }

  const quote = await getInstrumentQuote({
    yahooSymbol: cfg.yahooSymbol,
    dhanSymbol: isGlobal ? undefined : key,
    isGlobal,
  });
  const spot = quote?.price ?? cfg.defaultSpot;
  const tYears = calculateTimeToExpiryYears(expiryDate);
  const daysToExpiry = Math.max(0.1, +(tYears * 365).toFixed(1));
  const atmStrike = Math.round(spot / step) * step;
  const points: SensibullGreekPoint[] = [];

  for (let i = -STRIKES_EACH_SIDE; i <= STRIKES_EACH_SIDE; i++) {
    const strike = atmStrike + i * step;
    // Assumed parametric IV smile (OTM puts at a premium). A model shape, not market IV.
    const moneyness = (strike - spot) / spot;
    const cIv = Math.max(8.0, Math.min(45.0, 14.5 - moneyness * 12 + moneyness * moneyness * 45));
    const pIv = Math.max(8.0, Math.min(50.0, 14.5 - moneyness * 16 + moneyness * moneyness * 60));
    const c = calculateGreeks({
      spot,
      strike,
      timeToExpiryYears: tYears,
      volatility: cIv / 100,
      type: "CE",
    });
    const p = calculateGreeks({
      spot,
      strike,
      timeToExpiryYears: tYears,
      volatility: pIv / 100,
      type: "PE",
    });
    points.push({
      strike,
      callDelta: +c.delta.toFixed(3),
      putDelta: +p.delta.toFixed(3),
      callGamma: +c.gamma.toFixed(4),
      putGamma: +p.gamma.toFixed(4),
      callTheta: +c.theta.toFixed(1),
      putTheta: +p.theta.toFixed(1),
      callVega: +c.vega.toFixed(1),
      putVega: +p.vega.toFixed(1),
      callIv: +cIv.toFixed(1),
      putIv: +pIv.toFixed(1),
      callLtp: +c.price.toFixed(2),
      putLtp: +p.price.toFixed(2),
      isAtm: strike === atmStrike,
      isItmCall: strike < spot,
      isItmPut: strike > spot,
    });
  }
  const { summary } = summarize(points, spot, step);

  return {
    symbol: cleanSym,
    underlyingPrice: spot,
    expiryDate,
    atmStrike,
    daysToExpiry,
    provider: isGlobal
      ? "CBOE / CME Global Feed"
      : "Sensibull Greeks Engine (Calibrated Live Feed)",
    dataSourceStatus: "CALIBRATED_ENGINE",
    timestamp: new Date().toISOString(),
    points,
    summary,
    isSimulated: true,
    dataSource: "black-scholes model",
    freshnessStatus: quote?.freshnessStatus ?? "STALE",
    dataQualityNotes: [
      "SIMULATED: theoretical Black-Scholes curves with an assumed IV smile (ALLOW_MOCK_DATA=true). Not market data and not from Sensibull.",
      quote
        ? `Underlying price is a real ${quote.source} quote.`
        : "Underlying price is a static reference level (no live quote reachable).",
      ...notes,
    ],
    sensibullStatus,
  };
}
