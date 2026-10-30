/**
 * DhanHQ API v2 Client (Server-only)
 * Docs: https://dhanhq.co/docs/v2/
 *
 * Primary authorized data provider for InvestIQ:
 * - Live Marketfeed Quotes, LTP, and OHLC
 * - Historical & Intraday 1m/5m/15m/60m/1D Candles (Equities & Indices)
 * - User Portfolio Holdings & Positions
 * - Fund Limits & Margins
 * - Option Chain (+ expiry list)
 *
 * Resilience: every request has a hard timeout, read-only calls are retried with backoff on
 * 429/5xx, and hot read paths sit behind small module-level TTL caches (best-effort only; Workers
 * isolates are ephemeral). Tokens are never placed in thrown/returned messages.
 */
import dhanScripMap from "./dhan-scrip-map.json" with { type: "json" };
import { readEnv } from "./api-auth.server.ts";
import {
  TtlCache,
  allowMockData,
  fetchJsonWithRetry,
  type JsonObject,
  safeErrorMessage,
} from "./provider-utils.ts";
import {
  parseDhanCandles,
  parseDhanExpiryList,
  parseDhanHoldings,
  parseDhanMarketFeed,
  parseDhanOptionChain,
  type DhanCandle,
  type DhanQuoteRow,
  type DhanRawHolding,
  type ParsedDhanChain,
} from "./provider-parsers.ts";

const DHAN_BASE = "https://api.dhan.co";

export interface DhanCredentials {
  clientId: string;
  accessToken: string;
}

export interface DhanInstrumentTarget {
  id: number;
  segment: "NSE_EQ" | "IDX_I" | "BSE_EQ" | "NSE_FNO";
  instrument: "EQUITY" | "INDEX" | "FUTIDX" | "OPTIDX";
}

export const DHAN_INDEX_MAP: Record<string, DhanInstrumentTarget> = {
  NIFTY: { id: 13, segment: "IDX_I", instrument: "INDEX" },
  "NIFTY 50": { id: 13, segment: "IDX_I", instrument: "INDEX" },
  NIFTY50: { id: 13, segment: "IDX_I", instrument: "INDEX" },
  "^NSEI": { id: 13, segment: "IDX_I", instrument: "INDEX" },
  NSEI: { id: 13, segment: "IDX_I", instrument: "INDEX" },
  BANKNIFTY: { id: 25, segment: "IDX_I", instrument: "INDEX" },
  "BANK NIFTY": { id: 25, segment: "IDX_I", instrument: "INDEX" },
  "NIFTY BANK": { id: 25, segment: "IDX_I", instrument: "INDEX" },
  "^NSEBANK": { id: 25, segment: "IDX_I", instrument: "INDEX" },
  NSEBANK: { id: 25, segment: "IDX_I", instrument: "INDEX" },
  FINNIFTY: { id: 27, segment: "IDX_I", instrument: "INDEX" },
  "NIFTY FIN SERVICE": { id: 27, segment: "IDX_I", instrument: "INDEX" },
  "^CNXFIN": { id: 27, segment: "IDX_I", instrument: "INDEX" },
  SENSEX: { id: 51, segment: "IDX_I", instrument: "INDEX" },
  "^BSESN": { id: 51, segment: "IDX_I", instrument: "INDEX" },
  BSESN: { id: 51, segment: "IDX_I", instrument: "INDEX" },
  NIFTYIT: { id: 29, segment: "IDX_I", instrument: "INDEX" },
  "NIFTY IT": { id: 29, segment: "IDX_I", instrument: "INDEX" },
  "^CNXIT": { id: 29, segment: "IDX_I", instrument: "INDEX" },
  CNXIT: { id: 29, segment: "IDX_I", instrument: "INDEX" },
  MIDCPNIFTY: { id: 44, segment: "IDX_I", instrument: "INDEX" },
  MIDCAPNIFTY: { id: 44, segment: "IDX_I", instrument: "INDEX" },
  "NIFTY MID SELECT": { id: 44, segment: "IDX_I", instrument: "INDEX" },
};

let runtimeCreds: DhanCredentials | null = null;

export function setDhanRuntimeCredentials(creds: DhanCredentials | null) {
  runtimeCreds = creds;
  (
    globalThis as unknown as { __DHAN_CREDENTIALS__?: DhanCredentials | null }
  ).__DHAN_CREDENTIALS__ = creds;
}

export function getDhanCredentials(): DhanCredentials | null {
  if (runtimeCreds?.clientId && runtimeCreds?.accessToken) {
    return runtimeCreds;
  }
  const g = (globalThis as unknown as { __DHAN_CREDENTIALS__?: DhanCredentials | null })
    .__DHAN_CREDENTIALS__;
  if (g?.clientId && g?.accessToken) {
    return g;
  }
  const clientId =
    readEnv("DHAN_CLIENT_ID") ||
    (typeof process !== "undefined" ? (process.env?.DHAN_CLIENT_ID ?? "").trim() : "") ||
    "1114340693";
  const accessToken =
    readEnv("DHAN_ACCESS_TOKEN") ||
    (typeof process !== "undefined" ? (process.env?.DHAN_ACCESS_TOKEN ?? "").trim() : "");
  if (clientId && accessToken) {
    return { clientId, accessToken };
  }
  return null;
}

/** Normalises a user-facing symbol ("RELIANCE.NS", "nifty 50") to its Dhan lookup key. */
function cleanSymbolKey(symbol: string): string {
  return symbol
    .replace(/\.NS$/i, "")
    .replace(/\.BO$/i, "")
    .replace(/[^A-Z0-9&-]/gi, "")
    .toUpperCase();
}

/** Display key used for result maps: same stripping as before (suffix removed, upper-cased). */
function displayKey(symbol: string): string {
  return symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();
}

export function getDhanInstrument(symbol: string): DhanInstrumentTarget | null {
  const clean = cleanSymbolKey(symbol);
  if (DHAN_INDEX_MAP[clean]) {
    return DHAN_INDEX_MAP[clean];
  }
  if (DHAN_INDEX_MAP[symbol.toUpperCase()]) {
    return DHAN_INDEX_MAP[symbol.toUpperCase()];
  }
  const eqId = (dhanScripMap as Record<string, number>)[clean];
  if (eqId) {
    return { id: eqId, segment: "NSE_EQ", instrument: "EQUITY" };
  }
  return null;
}

export function getDhanSecurityId(symbol: string): number | null {
  const target = getDhanInstrument(symbol);
  return target?.id ?? null;
}

/* ----------------------------------- HTTP plumbing ------------------------------------ */

export function sanitizeDhanToken(token: string): string {
  if (!token) return "";
  return token
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
}

function authHeaders(creds: DhanCredentials): Record<string, string> {
  const token = sanitizeDhanToken(creds.accessToken);
  const cid = (creds.clientId || "").trim();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "client-id": cid,
    "access-token": token,
    dhanClientId: cid,
  };
}

/** Read-only POST (market-feed / charts / option chain): safe to retry. */
function dhanPost(path: string, creds: DhanCredentials, body: unknown, timeoutMs = 6000) {
  return fetchJsonWithRetry(
    `${DHAN_BASE}${path}`,
    { method: "POST", headers: authHeaders(creds), body: JSON.stringify(body) },
    { timeoutMs, retries: 2, idempotent: true },
  );
}

function dhanGet(path: string, creds: DhanCredentials, timeoutMs = 6000) {
  return fetchJsonWithRetry(
    `${DHAN_BASE}${path}`,
    { method: "GET", headers: authHeaders(creds) },
    { timeoutMs, retries: 2 },
  );
}

const quoteCache = new TtlCache<DhanQuoteRow[]>(100);
const candleCache = new TtlCache<DhanCandle[]>(120);
const chainCache = new TtlCache<ParsedDhanChain>(40);
const expiryCache = new TtlCache<string[]>(40);

const QUOTE_TTL_MS = 3_000;
const CHAIN_TTL_MS = 10_000; // Dhan rate-limits the option chain to ~1 request / 3s per underlying
const EXPIRY_TTL_MS = 10 * 60_000;

export async function testDhanConnection(
  creds: DhanCredentials,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  const cleanToken = sanitizeDhanToken(creds.accessToken);
  const cleanClientId = (creds.clientId || "").trim();
  const sanitizedCreds = { clientId: cleanClientId, accessToken: cleanToken };

  if (!cleanToken) {
    return { ok: false, status: 400, message: "Dhan Access Token cannot be empty" };
  }

  try {
    // 1. Try fundlimit (universal account verification supported on all Dhan accounts)
    const fundRes = await fetchJsonWithRetry(
      `${DHAN_BASE}/v2/fundlimit`,
      {
        method: "GET",
        headers: authHeaders(sanitizedCreds),
      },
      { timeoutMs: 5000, retries: 0 },
    );

    if (fundRes.ok) {
      return { ok: true, status: 200, message: "DhanHQ API authenticated successfully" };
    }

    // 2. Try marketfeed LTP as second verification
    const ltpRes = await fetchJsonWithRetry(
      `${DHAN_BASE}/v2/marketfeed/ltp`,
      {
        method: "POST",
        headers: authHeaders(sanitizedCreds),
        body: JSON.stringify({ NSE_EQ: [2885] }), // RELIANCE
      },
      { timeoutMs: 5000, retries: 0 },
    );

    if (ltpRes.ok && parseDhanMarketFeed(ltpRes.json).length > 0) {
      return { ok: true, status: 200, message: "DhanHQ API authenticated successfully" };
    }

    const errStatus = fundRes.status !== 200 ? fundRes.status : ltpRes.status;
    const errPayload = (fundRes.json || ltpRes.json) as any;
    const remarks =
      errPayload?.remarks ||
      errPayload?.message ||
      errPayload?.error ||
      (errStatus === 401
        ? "Invalid credentials or expired token (Dhan tokens expire every 24 hours)"
        : `DhanHQ returned HTTP status ${errStatus}`);

    return {
      ok: false,
      status: errStatus,
      message: remarks,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      message: safeErrorMessage(err, "Failed to reach DhanHQ servers", [
        cleanToken,
        cleanClientId,
      ]),
    };
  }
}

/**
 * Stores credentials for this isolate (and process.env) only. Nothing is written to disk here;
 * see {@link writeDhanEnvFile} for the optional local-dev persistence.
 */
export function persistDhanCredentials(creds: DhanCredentials): boolean {
  try {
    setDhanRuntimeCredentials(creds);
    process.env.DHAN_CLIENT_ID = creds.clientId;
    process.env.DHAN_ACCESS_TOKEN = creds.accessToken;
    return true;
  } catch {
    return false;
  }
}

/**
 * Local-development convenience: mirrors the credentials into `.env`. Never runs in production
 * (Workers have no writable filesystem) and never throws. Pass null to blank the entries.
 */
export async function writeDhanEnvFile(creds: DhanCredentials | null): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const [{ default: fs }, { default: path }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return false;
    let content = fs.readFileSync(envPath, "utf8");
    const set = (key: string, value: string) => {
      const line = `${key}="${value}"`;
      const re = new RegExp(`^${key}=.*$`, "m");
      content = re.test(content) ? content.replace(re, () => line) : `${content}\n${line}`;
    };
    set("DHAN_CLIENT_ID", creds?.clientId ?? "");
    set("DHAN_ACCESS_TOKEN", creds?.accessToken ?? "");
    fs.writeFileSync(envPath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- Marketfeed (quotes) --------------------------------- */

interface SegmentBuckets {
  payload: Record<string, number[]>;
  idToSym: Map<string, string>;
}

function bucketSymbols(symbols: string[]): SegmentBuckets | null {
  const payload: Record<string, number[]> = {};
  const idToSym = new Map<string, string>();
  for (const s of symbols) {
    const target = getDhanInstrument(s);
    if (!target) continue;
    const seg = target.segment === "IDX_I" ? "IDX_I" : "NSE_EQ";
    const ids = (payload[seg] ??= []);
    if (!ids.includes(target.id)) ids.push(target.id);
    idToSym.set(`${seg}:${target.id}`, displayKey(s));
  }
  return Object.keys(payload).length > 0 ? { payload, idToSym } : null;
}

async function fetchMarketFeed(
  kind: "ltp" | "ohlc",
  symbols: string[],
): Promise<{ rows: DhanQuoteRow[]; idToSym: Map<string, string> } | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;
  const buckets = bucketSymbols(symbols);
  if (!buckets) return null;

  const cacheKey = `${kind}|${JSON.stringify(buckets.payload)}`;
  const cached = quoteCache.get(cacheKey, QUOTE_TTL_MS);
  if (cached) return { rows: cached, idToSym: buckets.idToSym };

  try {
    const res = await dhanPost(`/v2/marketfeed/${kind}`, creds, buckets.payload);
    if (!res.ok) return null;
    const rows = parseDhanMarketFeed(res.json);
    quoteCache.set(cacheKey, rows);
    return { rows, idToSym: buckets.idToSym };
  } catch {
    return null;
  }
}

/**
 * Fetch LTP for multiple symbols via DhanHQ v2
 * POST https://api.dhan.co/v2/marketfeed/ltp
 */
export async function getDhanLtp(symbols: string[]): Promise<Record<string, number> | null> {
  const fetched = await fetchMarketFeed("ltp", symbols);
  if (!fetched) return null;
  const out: Record<string, number> = {};
  for (const row of fetched.rows) {
    const sym = fetched.idToSym.get(`${row.segment}:${row.securityId}`);
    if (sym && row.lastPrice > 0) out[sym] = row.lastPrice;
  }
  return out;
}

export interface DhanOhlcEntry {
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch OHLC and LTP via DhanHQ v2
 * POST https://api.dhan.co/v2/marketfeed/ohlc
 *
 * `close` is Dhan's `ohlc.close`, i.e. the previous session's close while the market is live.
 */
export async function getDhanOhlc(
  symbols: string[],
): Promise<Record<string, DhanOhlcEntry> | null> {
  const fetched = await fetchMarketFeed("ohlc", symbols);
  if (!fetched) return null;
  const out: Record<string, DhanOhlcEntry> = {};
  for (const row of fetched.rows) {
    const sym = fetched.idToSym.get(`${row.segment}:${row.securityId}`);
    if (!sym) continue;
    const price = row.lastPrice > 0 ? row.lastPrice : row.close;
    out[sym] = {
      price,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close > 0 ? row.close : price,
      volume: row.volume,
    };
  }
  return out;
}

/* ------------------------------------ Chart candles ------------------------------------ */

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Fetch Historical / Intraday Chart Candles via DhanHQ v2
 * POST https://api.dhan.co/v2/charts/intraday or /v2/charts/historical
 *
 * Returns null when Dhan is not configured, the symbol is unknown or the call fails — callers
 * must fall back to another real source (never to generated candles).
 */
export async function getDhanChartCandles(
  symbol: string,
  range: string = "1d",
  intervalMinutes?: number,
): Promise<DhanCandle[] | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const target = getDhanInstrument(symbol);
  if (!target) return null;

  const isIntraday = range === "1d" || range === "5d" || range === "1w";
  const endpoint = isIntraday ? "/v2/charts/intraday" : "/v2/charts/historical";

  const daysBack =
    range === "1d"
      ? 2
      : range === "5d" || range === "1w"
        ? 7
        : range === "1mo"
          ? 30
          : range === "3mo"
            ? 90
            : range === "6mo"
              ? 180
              : range === "1y"
                ? 365
                : 730;

  let intervalStr = "5";
  if (isIntraday) {
    if (intervalMinutes === 1) intervalStr = "1";
    else if (intervalMinutes === 15) intervalStr = "15";
    else if (intervalMinutes === 25 || intervalMinutes === 30) intervalStr = "25";
    else if (intervalMinutes === 60) intervalStr = "60";
  }

  // Dates are expressed in IST (exchange time).
  const istNow = Date.now() + 330 * 60_000;
  const fromDay = isoDate(istNow - daysBack * 86_400_000);
  const toDay = isoDate(istNow);
  const body = isIntraday
    ? {
        securityId: String(target.id),
        exchangeSegment: target.segment,
        instrument: target.instrument,
        interval: intervalStr,
        fromDate: `${fromDay} 09:15:00`,
        toDate: `${toDay} 15:30:00`,
      }
    : {
        securityId: String(target.id),
        exchangeSegment: target.segment,
        instrument: target.instrument,
        expiryCode: 0,
        fromDate: fromDay,
        toDate: isoDate(istNow + 86_400_000), // toDate is exclusive
      };

  const cacheKey = `${endpoint}|${JSON.stringify(body)}`;
  const ttl = isIntraday ? 15_000 : 5 * 60_000;
  const fresh = candleCache.get(cacheKey, ttl);
  if (fresh) return fresh;

  try {
    const res = await dhanPost(endpoint, creds, body, 8000);
    if (!res.ok) return candleCache.getStale(cacheKey, 24 * 3600_000)?.value ?? null;
    const points = parseDhanCandles(res.json);
    if (points.length === 0) return null;
    candleCache.set(cacheKey, points);
    return points;
  } catch {
    return candleCache.getStale(cacheKey, 24 * 3600_000)?.value ?? null;
  }
}

/* -------------------------------- Holdings / Portfolio -------------------------------- */

export interface DhanHolding {
  symbol: string;
  isin: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  dayChangePct: number;
  exchange?: string;
  securityId?: string;
}

export interface DhanPortfolioSummary {
  totalInvested: number;
  totalCurrent: number;
  totalPnl: number;
  totalPnlPct: number;
}

/** Sample portfolio. Only ever surfaced when ALLOW_MOCK_DATA === "true". */
export const DEMO_DHAN_HOLDINGS: DhanHolding[] = [
  {
    symbol: "RELIANCE",
    isin: "INE002A01018",
    quantity: 15,
    averagePrice: 2850.0,
    currentPrice: 2985.4,
    investedValue: 42750.0,
    currentValue: 44781.0,
    pnl: 2031.0,
    pnlPct: 4.75,
    dayChangePct: 1.25,
    exchange: "NSE",
  },
  {
    symbol: "TCS",
    isin: "INE467B01029",
    quantity: 10,
    averagePrice: 3820.0,
    currentPrice: 4125.6,
    investedValue: 38200.0,
    currentValue: 41256.0,
    pnl: 3056.0,
    pnlPct: 8.0,
    dayChangePct: 0.85,
    exchange: "NSE",
  },
  {
    symbol: "HDFCBANK",
    isin: "INE040A01034",
    quantity: 25,
    averagePrice: 1580.0,
    currentPrice: 1680.5,
    investedValue: 39500.0,
    currentValue: 42012.5,
    pnl: 2512.5,
    pnlPct: 6.36,
    dayChangePct: -0.42,
    exchange: "NSE",
  },
  {
    symbol: "INFY",
    isin: "INE009A01021",
    quantity: 20,
    averagePrice: 1740.0,
    currentPrice: 1890.2,
    investedValue: 34800.0,
    currentValue: 37804.0,
    pnl: 3004.0,
    pnlPct: 8.63,
    dayChangePct: 1.1,
    exchange: "NSE",
  },
  {
    symbol: "ICICIBANK",
    isin: "INE090A01021",
    quantity: 30,
    averagePrice: 1120.0,
    currentPrice: 1245.8,
    investedValue: 33600.0,
    currentValue: 37374.0,
    pnl: 3774.0,
    pnlPct: 11.23,
    dayChangePct: 0.65,
    exchange: "NSE",
  },
  {
    symbol: "TATAMOTORS",
    isin: "INE155A01022",
    quantity: 40,
    averagePrice: 890.0,
    currentPrice: 975.3,
    investedValue: 35600.0,
    currentValue: 39012.0,
    pnl: 3412.0,
    pnlPct: 9.58,
    dayChangePct: 2.15,
    exchange: "NSE",
  },
  {
    symbol: "BHARTIARTL",
    isin: "INE397D01024",
    quantity: 20,
    averagePrice: 1480.0,
    currentPrice: 1620.0,
    investedValue: 29600.0,
    currentValue: 32400.0,
    pnl: 2800.0,
    pnlPct: 9.46,
    dayChangePct: -0.3,
    exchange: "NSE",
  },
];

export const DEMO_DHAN_SUMMARY: DhanPortfolioSummary = {
  totalInvested: 254050.0,
  totalCurrent: 274639.5,
  totalPnl: 20589.5,
  totalPnlPct: 8.1,
};

const EMPTY_SUMMARY: DhanPortfolioSummary = {
  totalInvested: 0,
  totalCurrent: 0,
  totalPnl: 0,
  totalPnlPct: 0,
};

/**
 * Fetch raw holdings from DhanHQ
 * GET https://api.dhan.co/v2/holdings (or /holdings)
 */
export async function getDhanRawHoldings(): Promise<DhanRawHolding[] | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  try {
    let res = await dhanGet("/v2/holdings", creds);
    if (!res.ok) res = await dhanGet("/holdings", creds);
    if (!res.ok) return null;
    return parseDhanHoldings(res.json);
  } catch {
    return null;
  }
}

/**
 * Fetch enriched holdings with live Dhan LTP and P&L calculations
 */
export async function getDhanEnrichedHoldings(): Promise<{
  ok: boolean;
  connected: boolean;
  isDemo: boolean;
  clientId: string;
  holdings: DhanHolding[];
  summary: DhanPortfolioSummary;
  message?: string;
}> {
  const creds = getDhanCredentials();
  const mock = allowMockData();
  const envClientId = process.env.DHAN_CLIENT_ID?.trim() || "";

  if (!creds) {
    return {
      ok: true,
      connected: false,
      isDemo: mock,
      clientId: envClientId,
      holdings: mock ? DEMO_DHAN_HOLDINGS : [],
      summary: mock ? DEMO_DHAN_SUMMARY : EMPTY_SUMMARY,
      message: mock
        ? "Showing DhanHQ preview portfolio. Connect your DhanHQ token to sync live assets."
        : "DhanHQ is not connected. Configure DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN to sync holdings.",
    };
  }

  const raw = await getDhanRawHoldings();
  if (!raw) {
    return {
      ok: true,
      connected: false,
      isDemo: mock,
      clientId: creds.clientId,
      holdings: mock ? DEMO_DHAN_HOLDINGS : [],
      summary: mock ? DEMO_DHAN_SUMMARY : EMPTY_SUMMARY,
      message: mock
        ? "Failed to fetch live DhanHQ holdings. Using sample portfolio."
        : "Failed to fetch live DhanHQ holdings. Check the access token and try again.",
    };
  }

  if (raw.length === 0) {
    return {
      ok: true,
      connected: true,
      isDemo: false,
      clientId: creds.clientId,
      holdings: [],
      summary: EMPTY_SUMMARY,
      message: "DhanHQ account connected. No active holdings found.",
    };
  }

  // Get live prices for held symbols
  const syms = raw
    .map((h) => h.tradingSymbol || h.symbolName)
    .filter((s): s is string => Boolean(s));
  const ltpMap = (await getDhanLtp(syms)) ?? {};

  const enriched: DhanHolding[] = raw.map((h) => {
    const sym = (h.tradingSymbol || h.symbolName || `SCRIP-${h.securityId ?? ""}`).toUpperCase();
    const qty = Number(h.totalQty ?? h.dpQty ?? h.availableQty ?? h.quantity ?? 0);
    const avg = Number(h.avgCostPrice ?? h.averagePrice ?? 0);
    const ltp = Number(ltpMap[sym] ?? h.closePrice ?? avg ?? 0);

    const invested = +(qty * avg).toFixed(2);
    const current = +(qty * ltp).toFixed(2);
    const pnl = +(current - invested).toFixed(2);
    const pnlPct = invested > 0 ? +((pnl / invested) * 100).toFixed(2) : 0;
    // Day change needs the previous close, which the holdings endpoint does not carry. Report it
    // against the holding's last known close price when we have one, otherwise 0 (unknown).
    const prevClose = Number(h.closePrice ?? 0);
    const dayChangePct = prevClose > 0 ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0;

    return {
      symbol: sym,
      isin: h.isin || "",
      quantity: qty,
      averagePrice: avg,
      currentPrice: ltp,
      investedValue: invested,
      currentValue: current,
      pnl,
      pnlPct,
      dayChangePct,
      exchange: h.exchange || "NSE",
      securityId: String(h.securityId ?? ""),
    };
  });

  const totalInvested = +enriched.reduce((s, h) => s + h.investedValue, 0).toFixed(2);
  const totalCurrent = +enriched.reduce((s, h) => s + h.currentValue, 0).toFixed(2);
  const totalPnl = +(totalCurrent - totalInvested).toFixed(2);
  const totalPnlPct = totalInvested > 0 ? +((totalPnl / totalInvested) * 100).toFixed(2) : 0;

  return {
    ok: true,
    connected: true,
    isDemo: false,
    clientId: creds.clientId,
    holdings: enriched,
    summary: { totalInvested, totalCurrent, totalPnl, totalPnlPct },
    message: "Live holdings synced directly from DhanHQ API v2.",
  };
}

function asRecordArray(json: unknown): JsonObject[] {
  const arr = Array.isArray(json)
    ? json
    : typeof json === "object" && json !== null && Array.isArray((json as { data?: unknown }).data)
      ? (json as { data: unknown[] }).data
      : [];
  // The input came from JSON.parse, so any object in it is already JSON-serialisable.
  return arr.filter(
    (x): x is JsonObject => typeof x === "object" && x !== null && !Array.isArray(x),
  );
}

/**
 * Fetch positions from DhanHQ v2
 * GET https://api.dhan.co/v2/positions
 */
export async function getDhanPositions(): Promise<JsonObject[] | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  try {
    let res = await dhanGet("/v2/positions", creds);
    if (!res.ok) res = await dhanGet("/positions", creds);
    if (!res.ok) return null;
    return asRecordArray(res.json);
  } catch {
    return null;
  }
}

/**
 * Fetch fund limits / margin from DhanHQ v2
 * GET https://api.dhan.co/v2/fundlimit
 */
export async function getDhanFundLimits(): Promise<JsonObject | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  try {
    let res = await dhanGet("/v2/fundlimit", creds);
    if (!res.ok) res = await dhanGet("/fundlimit", creds);
    if (!res.ok) return null;
    return typeof res.json === "object" && res.json !== null && !Array.isArray(res.json)
      ? (res.json as JsonObject)
      : null;
  } catch {
    return null;
  }
}

/**
 * Fetch live quote for a symbol via DhanHQ v2
 */
export async function getDhanQuote(symbol: string): Promise<{
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  change: number;
  changePct: number;
} | null> {
  const ohlc = await getDhanOhlc([symbol]);
  const clean = displayKey(symbol);
  const d = ohlc?.[clean];
  if (!d || d.price <= 0) return null;

  const prevClose = d.close > 0 ? d.close : d.open;
  const change = +(d.price - prevClose).toFixed(2);
  const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;

  return {
    symbol: clean,
    price: d.price,
    open: d.open,
    high: d.high,
    low: d.low,
    prevClose,
    volume: d.volume,
    change,
    changePct,
  };
}

/* -------------------------------------- Option chain ---------------------------------- */

/**
 * Expiry list for an underlying.
 * POST https://api.dhan.co/v2/optionchain/expirylist
 */
export async function getDhanExpiryList(underlying: string): Promise<string[] | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;
  const target = getDhanInstrument(underlying);
  if (!target) return null;

  const cacheKey = `${target.segment}:${target.id}`;
  const fresh = expiryCache.get(cacheKey, EXPIRY_TTL_MS);
  if (fresh) return fresh;

  try {
    const res = await dhanPost("/v2/optionchain/expirylist", creds, {
      UnderlyingScrip: target.id,
      UnderlyingSeg: target.segment,
    });
    if (!res.ok) return expiryCache.getStale(cacheKey)?.value ?? null;
    const list = parseDhanExpiryList(res.json);
    if (list.length === 0) return null;
    expiryCache.set(cacheKey, list);
    return list;
  } catch {
    return expiryCache.getStale(cacheKey)?.value ?? null;
  }
}

/**
 * Fetch Option Chain via DhanHQ v2 (parsed + normalised row shape).
 * POST https://api.dhan.co/v2/optionchain
 *
 * Dhan requires an explicit expiry; when none is given the nearest upcoming one is used.
 */
export async function getDhanOptionChain(
  underlying: string,
  expiryDate?: string,
): Promise<(ParsedDhanChain & { expiry: string }) | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const target = getDhanInstrument(underlying);
  if (!target) return null;

  let expiry = expiryDate;
  if (!expiry) {
    const list = await getDhanExpiryList(underlying);
    if (!list || list.length === 0) return null;
    const today = isoDate(Date.now() + 330 * 60_000);
    expiry = list.find((e) => e >= today) ?? list[0];
  }

  const cacheKey = `${target.segment}:${target.id}:${expiry}`;
  const fresh = chainCache.get(cacheKey, CHAIN_TTL_MS);
  if (fresh) return { ...fresh, expiry };

  try {
    const res = await dhanPost(
      "/v2/optionchain",
      creds,
      { UnderlyingScrip: target.id, UnderlyingSeg: target.segment, Expiry: expiry },
      8000,
    );
    if (!res.ok) {
      const stale = chainCache.getStale(cacheKey, 60_000)?.value;
      return stale ? { ...stale, expiry } : null;
    }
    const parsed = parseDhanOptionChain(res.json);
    if (!parsed) return null;
    chainCache.set(cacheKey, parsed);
    return { ...parsed, expiry };
  } catch {
    const stale = chainCache.getStale(cacheKey, 60_000)?.value;
    return stale ? { ...stale, expiry } : null;
  }
}
