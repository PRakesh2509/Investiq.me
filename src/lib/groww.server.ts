/**
 * Groww Trading API client (server-only).
 *
 * Auth: API key + secret -> daily access token (expires 06:00 IST).
 * Docs: https://groww.in/trade-api/docs/curl
 */
import { createHash } from "node:crypto";

const BASE = "https://api.groww.in";

export class GrowwMissingEnvError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Missing Groww credentials: ${missing.join(", ")}`);
    this.missing = missing;
  }
}

/** Thrown when the key authenticates but lacks the required data subscription. */
export class GrowwForbiddenError extends Error {
  constructor(path: string) {
    super(
      `Groww API rejected ${path} (403). Enable the Live Data / Historical Data ` +
        `roles for this API key in the Groww Trading API dashboard.`,
    );
  }
}

function credentials() {
  const key = process.env["GROWW_API_KEY"];
  const secret = process.env["GROWW_API_SECRET"];
  const missing: string[] = [];
  if (!key) missing.push("GROWW_API_KEY");
  if (!secret) missing.push("GROWW_API_SECRET");
  if (missing.length) throw new GrowwMissingEnvError(missing);
  return { key: key!, secret: secret! };
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getGrowwToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { key, secret } = credentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const checksum = createHash("sha256").update(secret + timestamp).digest("hex");
  const res = await fetch(`${BASE}/v1/token/api/access`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-API-VERSION": "1.0",
    },
    body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    token?: string;
    expiry?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.token) {
    throw new Error(json?.error?.message ?? `Groww token request failed (${res.status})`);
  }
  const expiry = json.expiry ? Date.parse(json.expiry + "+05:30") : NaN;
  cached = {
    token: json.token,
    expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + 6 * 3600_000,
  };
  return cached.token;
}

async function growwGet<T>(path: string): Promise<T> {
  const token = await getGrowwToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-API-VERSION": "1.0",
      Accept: "application/json",
    },
  });
  if (res.status === 401) {
    cached = null;
    throw new Error("Groww access token expired");
  }
  if (res.status === 403) throw new GrowwForbiddenError(path);
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    payload?: T;
    error?: { message?: string };
  };
  if (!res.ok || json.status === "FAILURE") {
    throw new Error(json?.error?.message ?? `Groww request failed (${res.status})`);
  }
  return (json.payload ?? (json as unknown)) as T;
}

/* --------------------------------- Live data -------------------------------- */

export type GrowwSegment = "CASH" | "FNO";

/** Last traded price for `EXCHANGE_SYMBOL` tokens, e.g. `NSE_RELIANCE`. */
export async function growwLtp(exchangeSymbols: string[], segment: GrowwSegment = "CASH") {
  const p = await growwGet<Record<string, number> | { ltp?: Record<string, number> }>(
    `/v1/live-data/ltp?segment=${segment}&exchange_symbols=${encodeURIComponent(
      exchangeSymbols.join(","),
    )}`,
  );
  return (("ltp" in (p as object) ? (p as any).ltp : p) ?? {}) as Record<string, number>;
}

export type GrowwQuote = {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  change: number;
  changePct: number;
};

export async function growwQuote(
  tradingSymbol: string,
  exchange = "NSE",
  segment: GrowwSegment = "CASH",
): Promise<GrowwQuote> {
  const q = await growwGet<any>(
    `/v1/live-data/quote?exchange=${exchange}&segment=${segment}&trading_symbol=${encodeURIComponent(
      tradingSymbol,
    )}`,
  );
  const ohlc = q?.ohlc ?? {};
  const price = Number(q?.last_price ?? q?.ltp ?? ohlc?.close ?? 0);
  const prevClose = Number(q?.close ?? q?.previous_close ?? ohlc?.close ?? price);
  const change = price - prevClose;
  return {
    symbol: tradingSymbol,
    price,
    open: Number(ohlc?.open ?? 0),
    high: Number(q?.day_high ?? ohlc?.high ?? 0),
    low: Number(q?.day_low ?? ohlc?.low ?? 0),
    prevClose,
    volume: Number(q?.volume ?? 0),
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
  };
}

/* ------------------------------ Historical data ----------------------------- */

export type GrowwCandle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * Historical / intraday candles. `start`/`end` are epoch ms.
 * Groww returns rows as [timestamp, open, high, low, close, volume].
 */
export async function growwCandles(opts: {
  tradingSymbol: string;
  exchange?: string;
  segment?: GrowwSegment;
  start: number;
  end: number;
  intervalMinutes?: number;
}): Promise<GrowwCandle[]> {
  const fmt = (ms: number) =>
    new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  const qs = new URLSearchParams({
    exchange: opts.exchange ?? "NSE",
    segment: opts.segment ?? "CASH",
    trading_symbol: opts.tradingSymbol,
    start_time: fmt(opts.start),
    end_time: fmt(opts.end),
  });
  if (opts.intervalMinutes) qs.set("interval_in_minutes", String(opts.intervalMinutes));
  const p = await growwGet<any>(`/v1/historical/candle/range?${qs.toString()}`);
  const rows: any[] = p?.candles ?? p?.candle ?? [];
  return rows
    .map((r) => ({
      time: Math.floor(Number(Array.isArray(r) ? r[0] : r?.timestamp) / (String(Array.isArray(r) ? r[0] : r?.timestamp).length > 10 ? 1000 : 1)),
      open: Number(Array.isArray(r) ? r[1] : r?.open),
      high: Number(Array.isArray(r) ? r[2] : r?.high),
      low: Number(Array.isArray(r) ? r[3] : r?.low),
      close: Number(Array.isArray(r) ? r[4] : r?.close),
      volume: Number((Array.isArray(r) ? r[5] : r?.volume) ?? 0),
    }))
    .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time));
}

/* ------------------------------- Option chain ------------------------------- */

export type GrowwOptionRow = {
  strike: number;
  call: { ltp: number; oi: number; oiChange: number; volume: number; iv: number };
  put: { ltp: number; oi: number; oiChange: number; volume: number; iv: number };
};

export type GrowwOptionChain = {
  underlying: string;
  expiry: string;
  spot: number;
  atmStrike: number;
  pcr: number;
  maxPain: number;
  totalCallOi: number;
  totalPutOi: number;
  rows: GrowwOptionRow[];
  generatedAt: number;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function leg(raw: any) {
  return {
    ltp: n(raw?.live_price?.ltp ?? raw?.ltp ?? raw?.last_price),
    oi: n(raw?.live_price?.open_interest ?? raw?.open_interest ?? raw?.oi),
    oiChange: n(raw?.live_price?.oi_day_change ?? raw?.oi_change),
    volume: n(raw?.live_price?.volume ?? raw?.volume),
    iv: n(raw?.implied_volatility ?? raw?.iv),
  };
}

export async function growwOptionChain(
  underlying: string,
  expiryDate: string,
  exchange = "NSE",
): Promise<GrowwOptionChain> {
  const p = await growwGet<any>(
    `/v1/option-chain/exchange/${exchange}/underlying/${encodeURIComponent(
      underlying,
    )}?expiry_date=${encodeURIComponent(expiryDate)}`,
  );
  const raw: any[] = p?.option_chains ?? p?.optionChains ?? [];
  const rows: GrowwOptionRow[] = raw
    .map((r) => ({
      strike: n(r?.strike_price ?? r?.strike),
      call: leg(r?.call_option ?? r?.call_options ?? r?.ce),
      put: leg(r?.put_option ?? r?.put_options ?? r?.pe),
    }))
    .filter((r) => r.strike > 0)
    .sort((a, b) => a.strike - b.strike);

  const spot = n(p?.underlying_ltp ?? p?.spot ?? raw[0]?.underlying_spot_price);
  const totalCallOi = rows.reduce((s, r) => s + r.call.oi, 0);
  const totalPutOi = rows.reduce((s, r) => s + r.put.oi, 0);

  let atmStrike = 0;
  let best = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.strike - spot);
    if (d < best) {
      best = d;
      atmStrike = r.strike;
    }
  }
  let maxPain = 0;
  let minPain = Infinity;
  for (const r of rows) {
    let pain = 0;
    for (const o of rows) {
      if (r.strike > o.strike) pain += (r.strike - o.strike) * o.call.oi;
      if (r.strike < o.strike) pain += (o.strike - r.strike) * o.put.oi;
    }
    if (pain < minPain) {
      minPain = pain;
      maxPain = r.strike;
    }
  }

  return {
    underlying,
    expiry: expiryDate,
    spot,
    atmStrike,
    pcr: totalCallOi ? Number((totalPutOi / totalCallOi).toFixed(2)) : 0,
    maxPain,
    totalCallOi,
    totalPutOi,
    rows,
    generatedAt: Date.now(),
  };
}

/* --------------------------------- Portfolio -------------------------------- */

export async function growwHoldings() {
  const p = await growwGet<{ holdings?: any[] }>("/v1/holdings/user");
  return p?.holdings ?? [];
}

/** Quick health probe used by the admin panel. */
export async function growwStatus() {
  const out: Record<string, string> = {};
  try {
    await getGrowwToken();
    out.auth = "ok";
  } catch (e) {
    out.auth = (e as Error).message;
    return out;
  }
  for (const [label, fn] of [
    ["liveData", () => growwLtp(["NSE_RELIANCE"])],
    ["historical", () =>
      growwCandles({
        tradingSymbol: "RELIANCE",
        start: Date.now() - 3 * 86400_000,
        end: Date.now(),
        intervalMinutes: 5,
      })],
    ["portfolio", () => growwHoldings()],
  ] as const) {
    try {
      await fn();
      out[label] = "ok";
    } catch (e) {
      out[label] = (e as Error).message;
    }
  }
  return out;
}
