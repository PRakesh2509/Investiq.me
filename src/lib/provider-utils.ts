/**
 * Pure helpers shared by the market-data provider layer.
 *
 * Deliberately free of Nitro / TanStack / filesystem imports so it can be unit-tested with
 * `node --test --experimental-strip-types`. Nothing here runs at module load: no timers, no
 * network, no env reads. Module-level caches are best-effort only (Cloudflare Workers isolates
 * are recycled at any time).
 */

/* ----------------------------------------------------------------------------------------- */
/* Freshness / market-hours                                                                  */
/* ----------------------------------------------------------------------------------------- */

export type FreshnessStatus = "LIVE" | "DELAYED" | "STALE" | "MARKET_CLOSED";

/**
 * Is the market for this instrument class open at `now`?
 *  - Indian cash/F&O: Mon-Fri 09:15-15:30 IST.
 *  - Global (CME index futures): Sun 22:00 UTC -> Fri 21:00 UTC. Exchange holidays are not modelled.
 */
export function isMarketOpenAt(now: Date, isGlobal: boolean): boolean {
  const day = now.getUTCDay(); // 0 = Sunday
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (isGlobal) {
    if (day === 6) return false;
    if (day === 0) return utcMinutes >= 22 * 60;
    if (day === 5) return utcMinutes < 21 * 60;
    return true;
  }
  const istMinutes = (utcMinutes + 330) % (24 * 60);
  const istDay = utcMinutes + 330 >= 24 * 60 ? (day + 1) % 7 : day;
  if (istDay < 1 || istDay > 5) return false;
  return istMinutes >= 9 * 60 + 15 && istMinutes <= 15 * 60 + 30;
}

export interface FreshnessInput {
  /** Timestamp (ms) of the data point the quote/bar describes. */
  asOfMs: number | null | undefined;
  nowMs: number;
  marketOpen: boolean;
  /** "delayed" feeds (Yahoo, CBOE delayed quotes) can never be better than DELAYED. */
  feed?: "realtime" | "delayed";
}

export function classifyFreshness(input: FreshnessInput): FreshnessStatus {
  if (!input.marketOpen) return "MARKET_CLOSED";
  const { asOfMs, nowMs } = input;
  if (typeof asOfMs !== "number" || !Number.isFinite(asOfMs) || asOfMs <= 0) return "STALE";
  const age = Math.max(0, nowMs - asOfMs);
  if (age <= 90_000 && input.feed !== "delayed") return "LIVE";
  if (age <= 20 * 60_000) return "DELAYED";
  return "STALE";
}

/** JSON-serialisable value (what survives a server-function boundary). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/* ----------------------------------------------------------------------------------------- */
/* Environment flags                                                                         */
/* ----------------------------------------------------------------------------------------- */

/** Synthetic/mock data is only ever allowed when ALLOW_MOCK_DATA is exactly "true". */
export function allowMockData(env: Record<string, string | undefined> = readEnv()): boolean {
  return env.ALLOW_MOCK_DATA === "true";
}

function readEnv(): Record<string, string | undefined> {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/* ----------------------------------------------------------------------------------------- */
/* TTL cache                                                                                 */
/* ----------------------------------------------------------------------------------------- */

interface CacheEntry<V> {
  value: V;
  storedAt: number;
}

/**
 * Tiny bounded TTL cache. Insertion order is used for eviction (oldest first).
 * `get` honours a TTL, `getStale` returns whatever is there (for stale-if-error fallbacks).
 */
export class TtlCache<V> {
  private readonly map = new Map<string, CacheEntry<V>>();
  private readonly maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string, ttlMs: number, now: number = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (now - hit.storedAt > ttlMs) return undefined;
    return hit.value;
  }

  getStale(
    key: string,
    maxAgeMs = Number.POSITIVE_INFINITY,
    now: number = Date.now(),
  ): { value: V; ageMs: number } | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    const ageMs = now - hit.storedAt;
    if (ageMs > maxAgeMs) return undefined;
    return { value: hit.value, ageMs };
  }

  set(key: string, value: V, now: number = Date.now()): void {
    // Re-insert so the key moves to the "newest" end.
    this.map.delete(key);
    this.map.set(key, { value, storedAt: now });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

/* ----------------------------------------------------------------------------------------- */
/* Error hygiene                                                                             */
/* ----------------------------------------------------------------------------------------- */

const REDACTIONS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [
    /(access[-_]?token|client[-_]?secret|api[-_]?key|api[-_]?secret|authorization|cookie)(["'\s:=]+)[^\s"',;&]+/gi,
    "$1$2[redacted]",
  ],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]"],
  [/(\b(?:token|key|apikey|api_key|access_token|secret|password)=)[^&\s]+/gi, "$1[redacted]"],
];

/** Strip anything that looks like a credential from a string (and any explicit secrets). */
export function redactSecrets(
  text: string,
  secrets: ReadonlyArray<string | undefined> = [],
): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  }
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

export function safeErrorMessage(
  err: unknown,
  fallback = "request failed",
  secrets: ReadonlyArray<string | undefined> = [],
): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const cleaned = redactSecrets(raw, secrets).trim();
  return (cleaned || fallback).slice(0, 300);
}

/** Error thrown by fetchWithRetry. The message never contains the URL path/query or headers. */
export class ProviderFetchError extends Error {
  readonly kind: "timeout" | "network";
  constructor(host: string, kind: "timeout" | "network") {
    super(`${host} request failed (${kind})`);
    this.name = "ProviderFetchError";
    this.kind = kind;
  }
}

/* ----------------------------------------------------------------------------------------- */
/* Fetch with timeout + bounded retry                                                        */
/* ----------------------------------------------------------------------------------------- */

export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Per-attempt timeout. Default 6000ms. */
  timeoutMs?: number;
  /** Extra attempts after the first (only for idempotent requests). Default 2, max 4. */
  retries?: number;
  /** Base backoff; attempt n waits base * 2^n (capped). Default 250ms. */
  backoffMs?: number;
  /**
   * Whether it is safe to retry. Defaults to true for GET/HEAD. Set true explicitly for
   * read-only POST endpoints (e.g. Dhan market-feed queries). Never set for order placement.
   */
  idempotent?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  retryAfter?: string | null,
): number {
  const exp = Math.min(baseMs * 2 ** attempt, 4000);
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(Math.max(exp, secs * 1000), 3000);
  }
  return exp;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "upstream";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const idempotent = opts.idempotent ?? (method === "GET" || method === "HEAD");
  const maxRetries = idempotent ? Math.min(4, Math.max(0, opts.retries ?? 2)) : 0;
  const timeoutMs = Math.min(30_000, Math.max(500, opts.timeoutMs ?? 6000));
  const baseMs = opts.backoffMs ?? 250;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;

  let lastKind: "timeout" | "network" = "network";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      init.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, timeoutSignal])
        : (init.signal ?? timeoutSignal);
    try {
      const res = await doFetch(url, { ...init, signal });
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
        const delay = computeBackoffMs(attempt, baseMs, res.headers.get("retry-after"));
        try {
          await res.body?.cancel();
        } catch {
          /* body already consumed or not cancellable */
        }
        await sleep(delay);
        continue;
      }
      return res;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      lastKind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
      if (attempt < maxRetries) {
        await sleep(computeBackoffMs(attempt, baseMs));
        continue;
      }
    }
  }
  throw new ProviderFetchError(hostOf(url), lastKind);
}

/** GET/POST helper returning parsed JSON (or null when the body is not JSON). Never throws on HTTP errors. */
export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetchWithRetry(url, init, opts);
  let json: unknown = null;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

/* ----------------------------------------------------------------------------------------- */
/* Input validation                                                                          */
/* ----------------------------------------------------------------------------------------- */

/** Tickers / index names: letters, digits, and & ^ . _ = - space. Max 32 chars. */
export const SYMBOL_RE = /^[A-Za-z0-9&^._= -]{1,32}$/;

export function isValidSymbol(value: unknown): value is string {
  return typeof value === "string" && SYMBOL_RE.test(value.trim()) && value.trim().length > 0;
}

/** Upstox instrument keys look like `NSE_INDEX|Nifty 50` or `NSE_EQ|INE002A01018`. */
export const INSTRUMENT_KEY_RE = /^[A-Z_]{3,16}\|[A-Za-z0-9 &._-]{1,40}$/;

export function isValidInstrumentKey(value: unknown): value is string {
  return typeof value === "string" && INSTRUMENT_KEY_RE.test(value);
}

/** Strict YYYY-MM-DD that is also a real calendar date. */
export function isValidExpiry(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const YAHOO_INTERVALS: readonly string[] = [
  "1m",
  "2m",
  "5m",
  "15m",
  "30m",
  "60m",
  "90m",
  "1h",
  "1d",
  "5d",
  "1wk",
  "1mo",
];
export const YAHOO_RANGES: readonly string[] = [
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
];

export function isAllowedYahooInterval(v: unknown): v is string {
  return typeof v === "string" && YAHOO_INTERVALS.includes(v);
}
export function isAllowedYahooRange(v: unknown): v is string {
  return typeof v === "string" && YAHOO_RANGES.includes(v);
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Split a comma list, drop invalid symbols, de-duplicate, and cap the length. */
export function parseSymbolList(csv: string | undefined | null, max = 120): string[] {
  if (!csv) return [];
  const seen = new Set<string>();
  for (const part of csv.split(",")) {
    const s = part.trim();
    if (isValidSymbol(s)) seen.add(s);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Next Thursday (UTC) as YYYY-MM-DD, strictly after `from`. Used only for labelling mock/baseline chains. */
export function nextThursdayISO(from: Date = new Date()): string {
  const add = (4 - from.getUTCDay() + 7) % 7 || 7;
  const d = new Date(from.getTime() + add * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Pick the first expiry on/after `today` (YYYY-MM-DD), else the first one. */
export function pickNearestExpiry(expiries: readonly string[], today: string): string | undefined {
  const sorted = [...expiries].filter(isValidExpiry).sort();
  return sorted.find((e) => e >= today) ?? sorted[0];
}
