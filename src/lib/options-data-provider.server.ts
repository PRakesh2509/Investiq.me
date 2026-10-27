/**
 * Provider-Independent Options Data Provider Service (`optionsDataProvider`)
 *
 * Implements a unified, normalized options data layer over AUTHORIZED feeds only.
 *
 * PROVIDER ORDER (explicit, first success wins):
 *   Indian underlyings (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, stocks):
 *     1. DhanHQ API v2         (primary authorized broker feed)
 *     2. Upstox API v2         (secondary authorized broker feed)
 *   US underlyings (SPX, NDX):
 *     3. Global delayed feed   (CBOE delayed quotes; opt-in via ENABLE_GLOBAL_OPTIONS_FEED=true,
 *                               because it is a public-site endpoint with its own terms of use)
 *   If nothing answers:
 *     - the last real chain held in the module cache (<= 10 min old) is returned as STALE, else
 *     - when ALLOW_MOCK_DATA === "true" a clearly flagged model chain is generated
 *       (isSimulated: true), else
 *     - an empty, errored chain is returned (rows: [], unavailable: true) whose dataQualityNotes
 *       explain why. Nothing is ever fabricated silently.
 *
 * Sensibull Compliance Note:
 * Sensibull does not provide a public developer API or data export license for third-party web
 * apps. Logged-in session scraping, cookies/session tokens and reverse-engineered private
 * endpoints are NOT used anywhere in InvestIQ. The only Sensibull path is an authorized
 * enterprise-partner integration (SENSIBULL_PARTNER_API_KEY / SECRET / BASE_URL); without those the
 * integration reports "unauthorized/unavailable" with a reason.
 */

import {
  calculateGreeks,
  calculateImpliedVolatility,
  calculateTimeToExpiryYears,
} from "./greeks-service.ts";
import {
  getDhanCredentials,
  getDhanExpiryList,
  getDhanInstrument,
  getDhanOptionChain,
} from "./dhan.server.ts";
import {
  INDEX_UNDERLYINGS,
  UpstoxAuthError,
  fetchExpiries as fetchUpstoxExpiries,
  fetchOptionChain as fetchUpstoxOptionChain,
  type OptionChain as UpstoxOptionChain,
  type OptionSide as UpstoxOptionSide,
} from "./upstox.server.ts";
import {
  TtlCache,
  allowMockData,
  classifyFreshness,
  fetchWithRetry,
  isMarketOpenAt,
  isValidExpiry,
  pickNearestExpiry,
  safeErrorMessage,
  type FreshnessStatus,
} from "./provider-utils.ts";
import {
  parseCboeChainText,
  type ParsedChainLeg,
  type ParsedChainRow,
} from "./provider-parsers.ts";

export interface OptionGreeksBreakdown {
  delta: number;
  gamma: number;
  theta: number;
  thetaPerDay: number;
  vega: number;
  vegaPerPoint: number;
  rho: number;
  iv: number;
  impliedVolatility: number;
  intrinsicValue: number;
  timeValue: number;
}

export interface NormalizedOptionLeg {
  instrumentIdentifier: string;
  type: "CE" | "PE";
  strikePrice: number;
  ltp: number;
  bid: number | null;
  bidQty: number | null;
  ask: number | null;
  askQty: number | null;
  volume: number;
  openInterest: number;
  prevOpenInterest: number;
  oiChange: number;
  oiChangePct: number;
  impliedVolatility: number; // e.g. 14.5 (%)
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  greeks: OptionGreeksBreakdown;
  greeksSource: "PROVIDER_SUPPLIED" | "CALCULATED_BLACK_SCHOLES" | "UNAVAILABLE";
  greeksModel?: string;
  isItm: boolean;
  isAtm: boolean;
}

export interface NormalizedOptionRow {
  strike: number;
  isAtm: boolean;
  call: NormalizedOptionLeg;
  put: NormalizedOptionLeg;
  ce: NormalizedOptionLeg;
  pe: NormalizedOptionLeg;
}

export interface NormalizedOptionChain {
  symbol: string;
  underlyingPrice: number;
  expiryDate: string;
  availableExpiries: string[];
  atmStrike: number;
  daysToExpiry: number;
  timestamp: string;
  pcr: number; // Total Put OI / Total Call OI
  pcrDefinition: string;
  maxPain: number;
  maxPainStrike: number;
  totalCallOi: number;
  totalPutOi: number;
  totalCallVolume: number;
  totalPutVolume: number;
  rows: NormalizedOptionRow[];
  strikes: NormalizedOptionRow[];
  provider:
    | "DhanHQ v2"
    | "Upstox v2"
    | "Sensibull (Unauthorized/Unsupported)"
    | "Internal Baseline"
    | "CBOE / CME Global";
  providerTimestamp: number;
  retrievedAt: number;
  freshnessStatus: FreshnessStatus;
  dataQualityNotes: string[];
  /** True only for model-generated chains (ALLOW_MOCK_DATA). Real broker chains are false. */
  isSimulated?: boolean;
  /** Machine-readable source: "dhan" | "upstox" | "cboe-delayed" | "baseline-model" | "unavailable" | "*-cache". */
  dataSource?: string;
  /** True when no provider answered and nothing was generated: rows is empty. */
  unavailable?: boolean;
}

export type SensibullAuthReport = ProviderStatusInfo;
export type NormalizedOptionStrike = NormalizedOptionRow;

export interface ProviderStatusInfo {
  providerName: "Sensibull" | "DhanHQ" | "Upstox" | "CBOE / CME";
  isAuthorized: boolean;
  status:
    "ACTIVE" | "UNAUTHORIZED_OR_UNAVAILABLE" | "CONFIG_MISSING" | "TOKEN_EXPIRED" | "GLOBAL_FEED";
  reason: string;
  documentationUrl: string;
  canStreamLiveData: boolean;
}

/** Human-readable provider order, exported for diagnostics/UI. */
export const OPTION_CHAIN_PROVIDER_ORDER = {
  india: ["DhanHQ v2", "Upstox v2"],
  us: ["CBOE delayed quotes (opt-in: ENABLE_GLOBAL_OPTIONS_FEED=true)"],
} as const;

/* ----------------------------------------------------------------------------------------- */
/* Sensibull (authorized partner credentials ONLY)                                           */
/* ----------------------------------------------------------------------------------------- */

export interface SensibullPartnerConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

/**
 * Returns the authorized partner configuration, or null. Cookies and session/access tokens are
 * deliberately NOT supported. `SENSIBULL_PARTNER_API_BASE_URL` is supplied with the partnership
 * agreement; there is no default endpoint.
 */
export function getSensibullPartnerConfig(): SensibullPartnerConfig | null {
  const apiKey = process.env.SENSIBULL_PARTNER_API_KEY?.trim();
  const apiSecret = process.env.SENSIBULL_PARTNER_SECRET?.trim();
  const baseUrl = process.env.SENSIBULL_PARTNER_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!apiKey || !apiSecret || !baseUrl) return null;
  if (!/^https:\/\//i.test(baseUrl)) return null;
  return { apiKey, apiSecret, baseUrl };
}

/**
 * Check authorization status for Sensibull integration.
 * We check only for authorized API partner credentials. Since Sensibull has no public
 * self-service developer API, we never scrape logged-in sessions or bypass authentication.
 */
export function getSensibullAuthorizationStatus(): ProviderStatusInfo {
  const partnerKey = process.env.SENSIBULL_PARTNER_API_KEY?.trim();
  const partnerSecret = process.env.SENSIBULL_PARTNER_SECRET?.trim();

  if (getSensibullPartnerConfig()) {
    return {
      providerName: "Sensibull",
      isAuthorized: true,
      status: "ACTIVE",
      reason: "Sensibull enterprise partner credentials configured.",
      documentationUrl: "https://sensibull.com",
      canStreamLiveData: true,
    };
  }

  if (partnerKey && partnerSecret) {
    return {
      providerName: "Sensibull",
      isAuthorized: false,
      status: "CONFIG_MISSING",
      reason:
        "Sensibull partner key/secret are set but SENSIBULL_PARTNER_API_BASE_URL (an https URL supplied with the partnership agreement) is missing.",
      documentationUrl: "https://sensibull.com/terms-of-use",
      canStreamLiveData: false,
    };
  }

  return {
    providerName: "Sensibull",
    isAuthorized: false,
    status: "UNAUTHORIZED_OR_UNAVAILABLE",
    reason:
      "Sensibull does not provide a public developer API for third-party websites without a signed enterprise partnership agreement. " +
      "Per InvestIQ safety policy and Sensibull Terms of Service, logged-in session scraping and reverse-engineering of private APIs are disabled. " +
      "InvestIQ routes options data through authorized broker APIs (DhanHQ API v2, then Upstox API v2).",
    documentationUrl: "https://sensibull.com/terms-of-use",
    canStreamLiveData: false,
  };
}

/**
 * Check DhanHQ Provider Status
 */
export function getDhanProviderStatus(): ProviderStatusInfo {
  const creds = getDhanCredentials();
  if (creds?.clientId && creds?.accessToken) {
    return {
      providerName: "DhanHQ",
      isAuthorized: true,
      status: "ACTIVE",
      reason: "DhanHQ API v2 client credentials active.",
      documentationUrl: "https://dhanhq.co/docs/v2/",
      canStreamLiveData: true,
    };
  }
  return {
    providerName: "DhanHQ",
    isAuthorized: false,
    status: "CONFIG_MISSING",
    reason: "DHAN_ACCESS_TOKEN not configured or token expired.",
    documentationUrl: "https://dhanhq.co/docs/v2/",
    canStreamLiveData: false,
  };
}

/**
 * Check Upstox Provider Status
 */
export function getUpstoxProviderStatus(): ProviderStatusInfo {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (token) {
    return {
      providerName: "Upstox",
      isAuthorized: true,
      status: "ACTIVE",
      reason: "Upstox API v2 access token configured.",
      documentationUrl: "https://upstox.com/developer/api-documentation/",
      canStreamLiveData: true,
    };
  }
  return {
    providerName: "Upstox",
    isAuthorized: false,
    status: "CONFIG_MISSING",
    reason: "UPSTOX_ACCESS_TOKEN environment variable not set.",
    documentationUrl: "https://upstox.com/developer/api-documentation/",
    canStreamLiveData: false,
  };
}

/* ----------------------------------------------------------------------------------------- */
/* Instrument routing                                                                        */
/* ----------------------------------------------------------------------------------------- */

const PCR_DEFINITION =
  "Ratio of Aggregate Put Open Interest to Aggregate Call Open Interest for the selected expiry";
const BS_MODEL = "Black-Scholes European (r=6.8%, q=1.2%)";
const MAX_ROWS = 120;

/** US index underlyings -> CBOE delayed-quote file. DJI has no equivalent file (unsupported). */
const GLOBAL_UNDERLYINGS: Record<string, { feed: string | null; label: string }> = {
  SP500: { feed: "_SPX", label: "SPX" },
  SPX: { feed: "_SPX", label: "SPX" },
  NASDAQ100: { feed: "_NDX", label: "NDX" },
  NDX: { feed: "_NDX", label: "NDX" },
  DOWJONES: { feed: null, label: "DJI" },
  DJI: { feed: null, label: "DJI" },
};

const UPSTOX_LABEL_ALIAS: Record<string, string> = {
  NIFTY: "NIFTY",
  NIFTY50: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  NIFTYBANK: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "MIDCPNIFTY",
  MIDCAPNIFTY: "MIDCPNIFTY",
  SENSEX: "SENSEX",
  BANKEX: "BANKEX",
};

/** Static levels used ONLY by the ALLOW_MOCK_DATA model chain. */
const BASELINE_REFERENCE: Record<string, { spot: number; step: number }> = {
  NIFTY: { spot: 22862.9, step: 50 },
  NIFTY50: { spot: 22862.9, step: 50 },
  BANKNIFTY: { spot: 51240, step: 100 },
  FINNIFTY: { spot: 23680, step: 50 },
  MIDCPNIFTY: { spot: 12450, step: 25 },
  MIDCAPNIFTY: { spot: 12450, step: 25 },
  SENSEX: { spot: 75210, step: 100 },
  SP500: { spot: 5865, step: 10 },
  SPX: { spot: 5865, step: 10 },
  NASDAQ100: { spot: 20450, step: 25 },
  NDX: { spot: 20450, step: 25 },
  DOWJONES: { spot: 42800, step: 50 },
  DJI: { spot: 42800, step: 50 },
};

function canonicalSymbol(symbol: string): string {
  return String(symbol ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);
}

const istToday = (now: number) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);

/* ----------------------------------------------------------------------------------------- */
/* Normalisation                                                                             */
/* ----------------------------------------------------------------------------------------- */

const pos = (n: number | undefined): number | undefined =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;

interface BuildLegArgs {
  symbol: string;
  expiry: string;
  strike: number;
  type: "CE" | "PE";
  spot: number;
  tYears: number;
  isAtm: boolean;
  raw: ParsedChainLeg;
}

function buildLeg(a: BuildLegArgs): NormalizedOptionLeg {
  const { raw, spot, strike, type, tYears } = a;
  const ltp = pos(raw.ltp) ?? 0;
  const oi = Math.max(0, raw.oi ?? 0);
  const prevOi = Math.max(0, raw.prevOi ?? oi);
  const oiChange = oi - prevOi;

  // IV: provider value, else solved from the traded price. Never invented.
  const providerIv = pos(raw.iv);
  const iv =
    providerIv ??
    (ltp > 0 ? pos(calculateImpliedVolatility(ltp, spot, strike, tYears, type)) : undefined);
  const bs = iv
    ? calculateGreeks({ spot, strike, timeToExpiryYears: tYears, volatility: iv / 100, type })
    : null;

  const providerGreeks = raw.delta !== undefined && raw.delta !== 0;
  const delta = providerGreeks ? (raw.delta ?? 0) : (bs?.delta ?? 0);
  const gamma = providerGreeks ? (raw.gamma ?? bs?.gamma ?? 0) : (bs?.gamma ?? 0);
  const theta = providerGreeks ? (raw.theta ?? bs?.theta ?? 0) : (bs?.theta ?? 0);
  const vega = providerGreeks ? (raw.vega ?? bs?.vega ?? 0) : (bs?.vega ?? 0);
  const rho = bs?.rho ?? 0;
  const intrinsic = type === "CE" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const greeksSource: NormalizedOptionLeg["greeksSource"] = providerGreeks
    ? "PROVIDER_SUPPLIED"
    : bs
      ? "CALCULATED_BLACK_SCHOLES"
      : "UNAVAILABLE";

  return {
    instrumentIdentifier: `${a.symbol}-${a.expiry}-${strike}-${type}`,
    type,
    strikePrice: strike,
    ltp,
    bid: pos(raw.bid) ?? null,
    bidQty: pos(raw.bidQty) ?? null,
    ask: pos(raw.ask) ?? null,
    askQty: pos(raw.askQty) ?? null,
    volume: Math.max(0, raw.volume ?? 0),
    openInterest: oi,
    prevOpenInterest: prevOi,
    oiChange,
    oiChangePct: prevOi > 0 ? +((oiChange / prevOi) * 100).toFixed(2) : 0,
    impliedVolatility: iv ? +iv.toFixed(2) : 0,
    delta,
    gamma,
    theta,
    vega,
    rho,
    greeks: {
      delta,
      gamma,
      theta,
      thetaPerDay: theta,
      vega,
      vegaPerPoint: vega,
      rho,
      iv: iv ? iv / 100 : 0,
      impliedVolatility: iv ?? 0,
      intrinsicValue: intrinsic,
      timeValue: Math.max(0, ltp - intrinsic),
    },
    greeksSource,
    greeksModel:
      greeksSource === "PROVIDER_SUPPLIED"
        ? "Provider-supplied Greeks"
        : greeksSource === "CALCULATED_BLACK_SCHOLES"
          ? BS_MODEL
          : undefined,
    isItm: type === "CE" ? strike < spot : strike > spot,
    isAtm: a.isAtm,
  };
}

/** Total payoff owed to option buyers if expiry settles at each strike; the minimum is max pain. */
export function computeMaxPain(rows: ReadonlyArray<ParsedChainRow>): number {
  let best = rows[0]?.strike ?? 0;
  let minLoss = Infinity;
  for (const k of rows) {
    let loss = 0;
    for (const r of rows) {
      if (k.strike > r.strike) loss += (k.strike - r.strike) * (r.ce.oi ?? 0);
      if (k.strike < r.strike) loss += (r.strike - k.strike) * (r.pe.oi ?? 0);
    }
    if (loss < minLoss) {
      minLoss = loss;
      best = k.strike;
    }
  }
  return best;
}

interface AssembleArgs {
  symbol: string;
  spot: number;
  expiry: string;
  availableExpiries: string[];
  rows: ParsedChainRow[];
  provider: NormalizedOptionChain["provider"];
  dataSource: string;
  freshnessStatus: FreshnessStatus;
  providerTimestamp: number;
  now: number;
  notes: string[];
  isSimulated: boolean;
}

function assembleChain(a: AssembleArgs): NormalizedOptionChain | null {
  const valid = a.rows.filter((r) => Number.isFinite(r.strike) && r.strike > 0);
  if (valid.length === 0 || !(a.spot > 0)) return null;
  valid.sort((x, y) => x.strike - y.strike);

  // Aggregates use the FULL chain; only the returned rows are trimmed around the money.
  const totalCallOi = valid.reduce((s, r) => s + (r.ce.oi ?? 0), 0);
  const totalPutOi = valid.reduce((s, r) => s + (r.pe.oi ?? 0), 0);
  const totalCallVol = valid.reduce((s, r) => s + (r.ce.volume ?? 0), 0);
  const totalPutVol = valid.reduce((s, r) => s + (r.pe.volume ?? 0), 0);
  const maxPain = computeMaxPain(valid);

  let atmStrike = valid[0].strike;
  let minDiff = Infinity;
  for (const r of valid) {
    const d = Math.abs(r.strike - a.spot);
    if (d < minDiff) {
      minDiff = d;
      atmStrike = r.strike;
    }
  }

  const shown =
    valid.length > MAX_ROWS
      ? [...valid]
          .sort((x, y) => Math.abs(x.strike - a.spot) - Math.abs(y.strike - a.spot))
          .slice(0, MAX_ROWS)
          .sort((x, y) => x.strike - y.strike)
      : valid;

  const tYears = calculateTimeToExpiryYears(a.expiry, new Date(a.now));
  const rows: NormalizedOptionRow[] = shown.map((r) => {
    const isAtm = r.strike === atmStrike;
    const common = {
      symbol: a.symbol,
      expiry: a.expiry,
      strike: r.strike,
      spot: a.spot,
      tYears,
      isAtm,
    };
    const call = buildLeg({ ...common, type: "CE", raw: r.ce });
    const put = buildLeg({ ...common, type: "PE", raw: r.pe });
    return { strike: r.strike, isAtm, call, put, ce: call, pe: put };
  });

  return {
    symbol: a.symbol,
    underlyingPrice: a.spot,
    expiryDate: a.expiry,
    availableExpiries: a.availableExpiries.length > 0 ? a.availableExpiries : [a.expiry],
    atmStrike,
    daysToExpiry: tYears * 365,
    timestamp: new Date(a.now).toISOString(),
    pcr: totalCallOi > 0 ? +(totalPutOi / totalCallOi).toFixed(2) : 0,
    pcrDefinition: PCR_DEFINITION,
    maxPain,
    maxPainStrike: maxPain,
    totalCallOi,
    totalPutOi,
    totalCallVolume: totalCallVol,
    totalPutVolume: totalPutVol,
    rows,
    strikes: rows,
    provider: a.provider,
    providerTimestamp: a.providerTimestamp,
    retrievedAt: a.now,
    freshnessStatus: a.freshnessStatus,
    dataQualityNotes: a.notes,
    isSimulated: a.isSimulated,
    dataSource: a.dataSource,
  };
}

/* ----------------------------------------------------------------------------------------- */
/* Providers                                                                                 */
/* ----------------------------------------------------------------------------------------- */

async function tryDhan(
  cleanSym: string,
  expiry: string | undefined,
  spotHint: number | undefined,
  now: number,
  failures: string[],
): Promise<NormalizedOptionChain | null> {
  if (!getDhanCredentials()) {
    failures.push("DhanHQ: credentials not configured.");
    return null;
  }
  if (!getDhanInstrument(cleanSym)) {
    failures.push(`DhanHQ: no instrument mapping for ${cleanSym}.`);
    return null;
  }
  const parsed = await getDhanOptionChain(cleanSym, expiry);
  if (!parsed) {
    failures.push("DhanHQ: option chain unavailable.");
    return null;
  }
  const spot = pos(parsed.spot) ?? pos(spotHint) ?? 0;
  const list = (await getDhanExpiryList(cleanSym)) ?? [parsed.expiry];
  const marketOpen = isMarketOpenAt(new Date(now), false);
  const chain = assembleChain({
    symbol: cleanSym,
    spot,
    expiry: parsed.expiry,
    availableExpiries: list,
    rows: parsed.rows,
    provider: "DhanHQ v2",
    dataSource: "dhan",
    freshnessStatus: classifyFreshness({ asOfMs: now, nowMs: now, marketOpen, feed: "realtime" }),
    providerTimestamp: now,
    now,
    notes: [
      "Streamed via authorized DhanHQ API v2 option chain",
      "Greeks are provider-supplied where available, otherwise Black-Scholes (r=6.8%) from provider IV",
    ],
    isSimulated: false,
  });
  if (!chain) failures.push("DhanHQ: option chain had no usable rows or spot.");
  return chain;
}

function upstoxLegFrom(s: UpstoxOptionSide): ParsedChainLeg {
  return {
    ltp: pos(s.ltp),
    oi: s.oi,
    prevOi: s.prevOi,
    volume: s.volume,
    iv: pos(s.iv),
    bid: pos(s.bid),
    bidQty: pos(s.bidQty),
    ask: pos(s.ask),
    askQty: pos(s.askQty),
    delta: s.delta || undefined,
    gamma: s.gamma || undefined,
    theta: s.theta || undefined,
    vega: s.vega || undefined,
  };
}

async function tryUpstox(
  cleanSym: string,
  expiry: string | undefined,
  now: number,
  failures: string[],
): Promise<NormalizedOptionChain | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) {
    failures.push("Upstox: UPSTOX_ACCESS_TOKEN not configured.");
    return null;
  }
  const label = UPSTOX_LABEL_ALIAS[cleanSym];
  const instrumentKey = INDEX_UNDERLYINGS.find((u) => u.label === label)?.key;
  if (!instrumentKey) {
    failures.push(`Upstox: no index mapping for ${cleanSym}.`);
    return null;
  }
  try {
    const expiries = await fetchUpstoxExpiries(instrumentKey, token);
    const chosen =
      expiry && isValidExpiry(expiry) ? expiry : pickNearestExpiry(expiries, istToday(now));
    if (!chosen) {
      failures.push("Upstox: no expiries available.");
      return null;
    }
    const raw: UpstoxOptionChain = await fetchUpstoxOptionChain(instrumentKey, chosen, token);
    const marketOpen = isMarketOpenAt(new Date(now), false);
    const chain = assembleChain({
      symbol: cleanSym,
      spot: raw.spot,
      expiry: raw.expiry,
      availableExpiries: expiries,
      rows: raw.rows.map((r) => ({
        strike: r.strike,
        ce: upstoxLegFrom(r.call),
        pe: upstoxLegFrom(r.put),
      })),
      provider: "Upstox v2",
      dataSource: raw.stale ? "upstox-cache" : "upstox",
      freshnessStatus: raw.stale
        ? marketOpen
          ? "STALE"
          : "MARKET_CLOSED"
        : classifyFreshness({ asOfMs: raw.generatedAt, nowMs: now, marketOpen, feed: "realtime" }),
      providerTimestamp: raw.generatedAt || now,
      now,
      notes: ["Streamed via Upstox API v2 feed"],
      isSimulated: false,
    });
    if (!chain) failures.push("Upstox: option chain had no usable rows or spot.");
    return chain;
  } catch (e) {
    failures.push(
      e instanceof UpstoxAuthError
        ? "Upstox: access token rejected (expired)."
        : `Upstox: ${safeErrorMessage(e, "request failed", [token])}`,
    );
    return null;
  }
}

function globalFeedEnabled(): boolean {
  return process.env.ENABLE_GLOBAL_OPTIONS_FEED === "true";
}

async function tryGlobal(
  cleanSym: string,
  expiry: string | undefined,
  now: number,
  failures: string[],
): Promise<NormalizedOptionChain | null> {
  const g = GLOBAL_UNDERLYINGS[cleanSym];
  if (!g) return null;
  if (!globalFeedEnabled()) {
    failures.push(
      "Global feed: disabled. Set ENABLE_GLOBAL_OPTIONS_FEED=true to use CBOE delayed quotes (review CBOE's terms of use first).",
    );
    return null;
  }
  if (!g.feed) {
    failures.push(`Global feed: no CBOE delayed-quote file for ${g.label}.`);
    return null;
  }
  try {
    const res = await fetchWithRetry(
      `https://cdn-api.cboe.com/api/global/delayed_quotes/options/${g.feed}.json`,
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 InvestIQ" } },
      { timeoutMs: 12_000, retries: 1 },
    );
    if (!res.ok) {
      failures.push(`Global feed: HTTP ${res.status}.`);
      return null;
    }
    const text = await res.text();
    const today = new Date(now).toISOString().slice(0, 10);
    const parsed = parseCboeChainText(text, (all) =>
      expiry && all.includes(expiry) ? expiry : pickNearestExpiry(all, today),
    );
    if (!parsed || !parsed.expiry || !parsed.spot) {
      failures.push("Global feed: unrecognised payload.");
      return null;
    }
    const byStrike = new Map<number, ParsedChainRow>();
    for (const o of parsed.options) {
      const row = byStrike.get(o.strike) ?? { strike: o.strike, ce: {}, pe: {} };
      const side = o.type === "CE" ? "ce" : "pe";
      // SPX and SPXW can list the same strike: keep the more liquid contract.
      if ((o.leg.oi ?? 0) >= (row[side].oi ?? -1)) row[side] = o.leg;
      byStrike.set(o.strike, row);
    }
    const asOf = parsed.timestampMs ?? now;
    const marketOpen = isMarketOpenAt(new Date(now), true);
    return assembleChain({
      symbol: cleanSym,
      spot: parsed.spot,
      expiry: parsed.expiry,
      availableExpiries: parsed.expiries.slice(0, 24),
      rows: [...byStrike.values()],
      provider: "CBOE / CME Global",
      dataSource: "cboe-delayed",
      freshnessStatus: classifyFreshness({ asOfMs: asOf, nowMs: now, marketOpen, feed: "delayed" }),
      providerTimestamp: asOf,
      now,
      notes: [
        "CBOE delayed quotes (about 15 minutes behind); not a real-time feed",
        "Greeks and IV are CBOE-supplied",
      ],
      isSimulated: false,
    });
  } catch (e) {
    failures.push(`Global feed: ${safeErrorMessage(e, "request failed")}`);
    return null;
  }
}

/* ----------------------------------------------------------------------------------------- */
/* Fallbacks                                                                                 */
/* ----------------------------------------------------------------------------------------- */

function unavailableChain(
  symbol: string,
  expiry: string | undefined,
  now: number,
  failures: string[],
): NormalizedOptionChain {
  return {
    symbol,
    underlyingPrice: 0,
    expiryDate: expiry ?? "",
    availableExpiries: [],
    atmStrike: 0,
    daysToExpiry: 0,
    timestamp: new Date(now).toISOString(),
    pcr: 0,
    pcrDefinition: PCR_DEFINITION,
    maxPain: 0,
    maxPainStrike: 0,
    totalCallOi: 0,
    totalPutOi: 0,
    totalCallVolume: 0,
    totalPutVolume: 0,
    rows: [],
    strikes: [],
    provider: "Internal Baseline",
    providerTimestamp: now,
    retrievedAt: now,
    freshnessStatus: "STALE",
    dataQualityNotes: [
      `No live option-chain data is available for ${symbol}; nothing was substituted.`,
      ...failures,
    ],
    isSimulated: false,
    dataSource: "unavailable",
    unavailable: true,
  };
}

/**
 * Model chain for ALLOW_MOCK_DATA === "true" only. Every number comes from a Black-Scholes model
 * around a static or caller-supplied spot and is flagged isSimulated: true.
 */
function generateBaselineNormalizedOptionChain(
  symbol: string,
  expiry: string | undefined,
  now: number,
  spotPrice: number | undefined,
  failures: string[],
): NormalizedOptionChain {
  const cfg = BASELINE_REFERENCE[symbol] ?? BASELINE_REFERENCE.NIFTY;
  const spot = pos(spotPrice) ?? cfg.spot;
  const step = cfg.step;

  const d = new Date(now);
  const add = (4 - d.getUTCDay() + 7) % 7 || 7;
  const expiryDate =
    expiry && isValidExpiry(expiry)
      ? expiry
      : new Date(now + add * 86_400_000).toISOString().slice(0, 10);
  const tYears = calculateTimeToExpiryYears(expiryDate, d);

  const atm = Math.round(spot / step) * step;
  const rows: ParsedChainRow[] = [];
  for (let i = -10; i <= 10; i++) {
    const strike = atm + i * step;
    const decay = Math.exp(-Math.abs(strike - spot) / (step * 8));
    const cOi = Math.round(650000 * decay + 45000);
    const pOi = Math.round(720000 * decay + 52000);
    const baseIv = 14.8 + (strike < spot ? 1.5 : -0.8);
    const cPx = Math.max(
      1,
      calculateGreeks({
        spot,
        strike,
        timeToExpiryYears: tYears,
        volatility: baseIv / 100,
        type: "CE",
      }).price,
    );
    const pPx = Math.max(
      1,
      calculateGreeks({
        spot,
        strike,
        timeToExpiryYears: tYears,
        volatility: (baseIv + 0.6) / 100,
        type: "PE",
      }).price,
    );
    rows.push({
      strike,
      ce: {
        ltp: cPx,
        bid: cPx * 0.99,
        ask: cPx * 1.01,
        oi: cOi,
        prevOi: Math.round(cOi * 0.92),
        volume: Math.round(180000 * decay + 12000),
        iv: baseIv,
      },
      pe: {
        ltp: pPx,
        bid: pPx * 0.99,
        ask: pPx * 1.01,
        oi: pOi,
        prevOi: Math.round(pOi * 0.88),
        volume: Math.round(195000 * decay + 14000),
        iv: baseIv + 0.6,
      },
    });
  }

  const chain = assembleChain({
    symbol,
    spot,
    expiry: expiryDate,
    availableExpiries: [expiryDate],
    rows,
    provider: "Internal Baseline",
    dataSource: "baseline-model",
    freshnessStatus: "STALE",
    providerTimestamp: now,
    now,
    notes: [
      "SIMULATED: model-generated chain (ALLOW_MOCK_DATA=true). Prices, OI and volume are not market data.",
      "Connect DhanHQ or Upstox credentials for live broker data",
      ...failures,
    ],
    isSimulated: true,
  });
  // assembleChain only returns null for empty/invalid input, which cannot happen here.
  return chain ?? unavailableChain(symbol, expiry, now, failures);
}

/* ----------------------------------------------------------------------------------------- */
/* Unified fetcher                                                                           */
/* ----------------------------------------------------------------------------------------- */

const CHAIN_TTL_MS = 8_000;
const CHAIN_STALE_MAX_MS = 10 * 60_000;
const chainCache = new TtlCache<NormalizedOptionChain>(40);
const inflight = new Map<string, Promise<NormalizedOptionChain>>();

async function resolveChain(
  cleanSym: string,
  expiry: string | undefined,
  spotHint: number | undefined,
  cacheKey: string,
): Promise<NormalizedOptionChain> {
  const now = Date.now();
  const failures: string[] = [];
  const isGlobal = Boolean(GLOBAL_UNDERLYINGS[cleanSym]);

  let chain: NormalizedOptionChain | null = null;
  if (isGlobal) {
    chain = await tryGlobal(cleanSym, expiry, now, failures);
  } else {
    chain = await tryDhan(cleanSym, expiry, spotHint, now, failures);
    if (!chain) chain = await tryUpstox(cleanSym, expiry, now, failures);
  }

  if (chain) {
    chainCache.set(cacheKey, chain);
    return chain;
  }

  const stale = chainCache.getStale(cacheKey, CHAIN_STALE_MAX_MS);
  if (stale) {
    const marketOpen = isMarketOpenAt(new Date(now), isGlobal);
    return {
      ...stale.value,
      freshnessStatus: marketOpen ? "STALE" : "MARKET_CLOSED",
      dataSource: `${stale.value.dataSource ?? "provider"}-cache`,
      dataQualityNotes: [
        `Live providers unreachable: serving the last real chain (${Math.round(stale.ageMs / 1000)}s old).`,
        ...stale.value.dataQualityNotes,
        ...failures,
      ],
    };
  }

  if (allowMockData()) {
    return generateBaselineNormalizedOptionChain(cleanSym, expiry, now, spotHint, failures);
  }
  return unavailableChain(cleanSym, expiry, now, failures);
}

/**
 * Unified provider options data fetcher. See the file header for the provider order and the
 * behaviour when no provider answers. `spotPrice` is only a hint (clamped) used when a provider
 * response omits the underlying price or, with ALLOW_MOCK_DATA, to centre the model chain.
 */
export async function getNormalizedOptionChain(
  symbol: string,
  expiry?: string,
  spotPrice?: number,
): Promise<NormalizedOptionChain> {
  const now = Date.now();
  const cleanSym = canonicalSymbol(symbol);
  if (!cleanSym) {
    return unavailableChain(String(symbol ?? "").slice(0, 24), expiry, now, [
      "Invalid or empty symbol.",
    ]);
  }
  const safeExpiry = expiry && isValidExpiry(expiry) ? expiry : undefined;
  const spotHint =
    typeof spotPrice === "number" && Number.isFinite(spotPrice) && spotPrice > 0 && spotPrice < 1e7
      ? spotPrice
      : undefined;

  const cacheKey = `${cleanSym}|${safeExpiry ?? ""}`;
  const fresh = chainCache.get(cacheKey, CHAIN_TTL_MS);
  if (fresh) return fresh;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const p = resolveChain(cleanSym, safeExpiry, spotHint, cacheKey).finally(() => {
    inflight.delete(cacheKey);
  });
  inflight.set(cacheKey, p);
  const chain = await p;
  if (expiry && !safeExpiry) {
    return {
      ...chain,
      dataQualityNotes: [
        ...chain.dataQualityNotes,
        "Ignored malformed expiry (expected YYYY-MM-DD).",
      ],
    };
  }
  return chain;
}

export const optionsDataProvider = {
  getOptionChain: getNormalizedOptionChain,
  getSensibullStatus: getSensibullAuthorizationStatus,
  getDhanStatus: getDhanProviderStatus,
  getUpstoxStatus: getUpstoxProviderStatus,
};
