/**
 * Upstox server-only helpers (personal, single-user setup).
 *
 * UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET and UPSTOX_ACCESS_TOKEN are read from
 * env INSIDE functions and never leave the server. Every Upstox request sends
 * `Authorization: Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`.
 *
 * Resilience: hard per-request timeout, bounded retry with backoff on 429/5xx (GET only), and
 * small module-level TTL caches. Error messages never contain the access token.
 */
import {
  TtlCache,
  fetchWithRetry,
  isValidExpiry,
  isValidInstrumentKey,
  safeErrorMessage,
} from "./provider-utils.ts";
import {
  parseUpstoxChain,
  parseUpstoxExpiries,
  parseUpstoxFeedUri,
  parseUpstoxSearch,
  upstoxErrorDetail,
  type UpstoxSideRaw,
} from "./provider-parsers.ts";

const BASE = "https://api.upstox.com";

export type UpstoxCredentials = {
  clientId: string;
  clientSecret: string;
};

export class MissingEnvError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. Configure them in your deployment environment.`,
    );
    this.missing = missing;
  }
}

/** Thrown when Upstox rejects the configured access token. */
export class UpstoxAuthError extends Error {
  tokenExpired = true as const;
  constructor(message = TOKEN_EXPIRED_MESSAGE) {
    super(message);
  }
}

/** Reads the OAuth app credentials. Only client id + secret are ever required. */
export function readUpstoxCredentials(requireSecret = true): UpstoxCredentials {
  const clientId = process.env["UPSTOX_CLIENT_ID"] ?? "";
  const clientSecret = process.env["UPSTOX_CLIENT_SECRET"] ?? "";

  const missing: string[] = [];
  if (!clientId) missing.push("UPSTOX_CLIENT_ID");
  if (requireSecret && !clientSecret) missing.push("UPSTOX_CLIENT_SECRET");
  if (missing.length) throw new MissingEnvError(missing);

  return { clientId, clientSecret };
}

/** Message shown whenever the configured token is rejected by Upstox. */
export const TOKEN_EXPIRED_MESSAGE =
  "UPSTOX_ACCESS_TOKEN has expired. Update the secret in your deployment environment and redeploy.";

/**
 * Returns the access token from the environment. Personal single-user setup:
 * the token is provided as an env var, never through the UI, and never sent
 * to the browser.
 */
export function getAccessToken(): string {
  const token = process.env["UPSTOX_ACCESS_TOKEN"] ?? "";
  if (!token) throw new MissingEnvError(["UPSTOX_ACCESS_TOKEN"]);
  return token;
}

async function upstoxGet(path: string, accessToken: string): Promise<unknown> {
  const res = await fetchWithRetry(
    `${BASE}${path}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
    { timeoutMs: 8000, retries: 2 },
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new UpstoxAuthError();
    }
    const detail = safeErrorMessage(upstoxErrorDetail(json, text.slice(0, 200)), "unknown error", [
      accessToken,
    ]);
    throw new Error(`Upstox API ${res.status}: ${detail}`);
  }
  return json;
}

/* ------------------------------- Underlyings ------------------------------ */

export type Underlying = {
  key: string;
  label: string;
  segment: "INDEX" | "EQ";
};

export const INDEX_UNDERLYINGS: Underlying[] = [
  { key: "NSE_INDEX|Nifty 50", label: "NIFTY", segment: "INDEX" },
  { key: "NSE_INDEX|Nifty Bank", label: "BANKNIFTY", segment: "INDEX" },
  { key: "NSE_INDEX|Nifty Fin Service", label: "FINNIFTY", segment: "INDEX" },
  { key: "NSE_INDEX|NIFTY MID SELECT", label: "MIDCPNIFTY", segment: "INDEX" },
  { key: "BSE_INDEX|SENSEX", label: "SENSEX", segment: "INDEX" },
  { key: "BSE_INDEX|BANKEX", label: "BANKEX", segment: "INDEX" },
];

/** Input guard for HTTP handlers: throws a RangeError (map to 400) on malformed keys. */
export function assertInstrumentKey(value: string): string {
  if (!isValidInstrumentKey(value)) throw new RangeError("invalid instrument_key");
  return value;
}

export function assertExpiry(value: string): string {
  if (!isValidExpiry(value)) throw new RangeError("invalid expiry (expected YYYY-MM-DD)");
  return value;
}

const expiryCache = new TtlCache<string[]>(40);
const chainCache = new TtlCache<OptionChain>(40);
const searchCache = new TtlCache<Underlying[]>(100);
const EXPIRY_TTL_MS = 5 * 60_000;
const CHAIN_TTL_MS = 10_000;
const SEARCH_TTL_MS = 60_000;
const CHAIN_STALE_MS = 2 * 60_000;

/* --------------------------------- Expiries -------------------------------- */

export async function fetchExpiries(instrumentKey: string, accessToken: string) {
  assertInstrumentKey(instrumentKey);
  const hit = expiryCache.get(instrumentKey, EXPIRY_TTL_MS);
  if (hit) return hit;
  try {
    const json = await upstoxGet(
      `/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`,
      accessToken,
    );
    const expiries = parseUpstoxExpiries(json);
    expiryCache.set(instrumentKey, expiries);
    return expiries;
  } catch (e) {
    const stale = expiryCache.getStale(instrumentKey);
    if (stale && !(e instanceof UpstoxAuthError)) return stale.value;
    throw e;
  }
}

/* ------------------------------- Option chain ------------------------------ */

export type OptionSide = {
  instrumentKey: string;
  ltp: number;
  close: number;
  volume: number;
  oi: number;
  prevOi: number;
  oiChange: number;
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};

export type OptionRow = {
  strike: number;
  call: OptionSide;
  put: OptionSide;
};

export type OptionChain = {
  underlyingKey: string;
  expiry: string;
  spot: number;
  atmStrike: number;
  pcr: number;
  maxPain: number;
  totalCallOi: number;
  totalPutOi: number;
  rows: OptionRow[];
  generatedAt: number;
  /** Optional provenance for badging. */
  dataSource?: string;
  isSimulated?: boolean;
  /** True when this is a previously fetched real chain served because the live call failed. */
  stale?: boolean;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function side(raw: UpstoxSideRaw | undefined): OptionSide {
  const md = raw?.market_data;
  const gk = raw?.option_greeks;
  const oi = num(md?.oi);
  const prevOi = num(md?.prev_oi);
  return {
    instrumentKey: raw?.instrument_key ?? "",
    ltp: num(md?.ltp),
    close: num(md?.close_price),
    volume: num(md?.volume),
    oi,
    prevOi,
    oiChange: oi - prevOi,
    bid: num(md?.bid_price),
    bidQty: num(md?.bid_qty),
    ask: num(md?.ask_price),
    askQty: num(md?.ask_qty),
    iv: num(gk?.iv),
    delta: num(gk?.delta),
    gamma: num(gk?.gamma),
    theta: num(gk?.theta),
    vega: num(gk?.vega),
  };
}

/** Total intrinsic loss to option writers if expiry settles at `strike`. */
function painAt(rows: OptionRow[], strike: number) {
  let pain = 0;
  for (const r of rows) {
    if (strike > r.strike) pain += (strike - r.strike) * r.call.oi;
    if (strike < r.strike) pain += (r.strike - strike) * r.put.oi;
  }
  return pain;
}

export async function fetchOptionChain(
  instrumentKey: string,
  expiry: string,
  accessToken: string,
): Promise<OptionChain> {
  assertInstrumentKey(instrumentKey);
  assertExpiry(expiry);
  const cacheKey = `${instrumentKey}|${expiry}`;
  const hit = chainCache.get(cacheKey, CHAIN_TTL_MS);
  if (hit) return hit;

  try {
    const json = await upstoxGet(
      `/v2/option/chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(expiry)}`,
      accessToken,
    );
    const raw = parseUpstoxChain(json);
    const rows: OptionRow[] = raw
      .map((r) => ({
        strike: num(r.strike_price),
        call: side(r.call_options),
        put: side(r.put_options),
      }))
      .filter((r) => r.strike > 0)
      .sort((a, b) => a.strike - b.strike);

    const spot = num(raw[0]?.underlying_spot_price);
    const totalCallOi = rows.reduce((s, r) => s + r.call.oi, 0);
    const totalPutOi = rows.reduce((s, r) => s + r.put.oi, 0);

    let atmStrike = 0;
    let bestDist = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.strike - spot);
      if (d < bestDist) {
        bestDist = d;
        atmStrike = r.strike;
      }
    }

    let maxPain = 0;
    let minPain = Infinity;
    for (const r of rows) {
      const p = painAt(rows, r.strike);
      if (p < minPain) {
        minPain = p;
        maxPain = r.strike;
      }
    }

    const chain: OptionChain = {
      underlyingKey: instrumentKey,
      expiry,
      spot,
      atmStrike,
      pcr: totalCallOi > 0 ? Number((totalPutOi / totalCallOi).toFixed(2)) : 0,
      maxPain,
      totalCallOi,
      totalPutOi,
      rows,
      generatedAt: Date.now(),
      dataSource: "upstox",
      isSimulated: false,
    };
    chainCache.set(cacheKey, chain);
    return chain;
  } catch (e) {
    const stale = chainCache.getStale(cacheKey, CHAIN_STALE_MS);
    if (stale && !(e instanceof UpstoxAuthError)) return { ...stale.value, stale: true };
    throw e;
  }
}

/* ---------------------------- Market feed (WS) ---------------------------- */

/** Returns a short-lived, pre-authorized websocket URI for the market data feed. */
export async function fetchMarketFeedUri(accessToken: string): Promise<string> {
  const json = await upstoxGet("/v3/feed/market-data-feed/authorize", accessToken);
  const uri = parseUpstoxFeedUri(json);
  if (!uri) throw new Error("Upstox did not return an authorized feed URI");
  return uri;
}

/* --------------------------------- Search --------------------------------- */

export async function searchUnderlyings(query: string, accessToken: string) {
  const q = query
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 &._-]/g, "")
    .slice(0, 40);
  const indices = INDEX_UNDERLYINGS.filter(
    (u) => !q || u.label.includes(q) || u.key.toUpperCase().includes(q),
  );
  if (!q) return indices;

  const hit = searchCache.get(q, SEARCH_TTL_MS);
  if (hit) return [...indices, ...hit];

  let stocks: Underlying[] = [];
  try {
    const json = await upstoxGet(
      `/v2/search/instruments?query=${encodeURIComponent(q)}&exchange=NSE`,
      accessToken,
    );
    stocks = parseUpstoxSearch(json)
      .filter((r) => (r.segment ?? "").includes("NSE_EQ") || r.instrument_type === "EQ")
      .slice(0, 12)
      .map((r) => ({
        key: r.instrument_key ?? "",
        label: r.trading_symbol ?? r.name ?? "",
        segment: "EQ" as const,
      }))
      .filter((r) => r.key && r.label);
    searchCache.set(q, stocks);
  } catch (e) {
    if (e instanceof UpstoxAuthError) throw e;
    stocks = [];
  }
  return [...indices, ...stocks];
}
