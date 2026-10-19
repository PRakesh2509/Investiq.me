/**
 * DhanHQ API v2 Client (Server-only)
 * Docs: https://dhanhq.co/docs/v2/
 */
import dhanScripMap from "./dhan-scrip-map.json" with { type: "json" };

const DHAN_BASE = "https://api.dhan.co";

export interface DhanCredentials {
  clientId: string;
  accessToken: string;
}

export function getDhanCredentials(): DhanCredentials | null {
  const clientId = process.env.DHAN_CLIENT_ID?.trim();
  const accessToken = process.env.DHAN_ACCESS_TOKEN?.trim();
  if (clientId && accessToken) {
    return { clientId, accessToken };
  }
  return null;
}

export function getDhanSecurityId(symbol: string): number | null {
  const clean = symbol.replace(/\.NS$/i, "").replace(/[^A-Z0-9&-]/g, "").toUpperCase();
  const id = (dhanScripMap as Record<string, number>)[clean];
  return id ?? null;
}

/**
 * Fetch LTP for multiple symbols via DhanHQ v2
 * POST https://api.dhan.co/v2/marketfeed/ltp
 */
export async function getDhanLtp(symbols: string[]): Promise<Record<string, number> | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const idToSym: Record<number, string> = {};
  const securityIds: number[] = [];

  for (const s of symbols) {
    const id = getDhanSecurityId(s);
    if (id) {
      securityIds.push(id);
      idToSym[id] = s.replace(/\.NS$/i, "").toUpperCase();
    }
  }

  if (!securityIds.length) return null;

  try {
    const res = await fetch(`${DHAN_BASE}/v2/marketfeed/ltp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
      body: JSON.stringify({
        NSE_EQ: securityIds,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const nseEqData = json?.data?.NSE_EQ ?? {};

    const out: Record<string, number> = {};
    for (const [idStr, val] of Object.entries(nseEqData)) {
      const sym = idToSym[Number(idStr)];
      if (sym && typeof (val as any)?.last_price === "number") {
        out[sym] = (val as any).last_price;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Fetch OHLC and LTP via DhanHQ v2
 * POST https://api.dhan.co/v2/marketfeed/ohlc
 */
export async function getDhanOhlc(symbols: string[]): Promise<
  Record<
    string,
    { price: number; open: number; high: number; low: number; close: number; volume: number }
  > | null
> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const idToSym: Record<number, string> = {};
  const securityIds: number[] = [];

  for (const s of symbols) {
    const id = getDhanSecurityId(s);
    if (id) {
      securityIds.push(id);
      idToSym[id] = s.replace(/\.NS$/i, "").toUpperCase();
    }
  }

  if (!securityIds.length) return null;

  try {
    const res = await fetch(`${DHAN_BASE}/v2/marketfeed/ohlc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
      body: JSON.stringify({
        NSE_EQ: securityIds,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const nseEqData = json?.data?.NSE_EQ ?? {};

    const out: Record<
      string,
      { price: number; open: number; high: number; low: number; close: number; volume: number }
    > = {};

    for (const [idStr, val] of Object.entries(nseEqData)) {
      const sym = idToSym[Number(idStr)];
      const v = val as any;
      if (sym && v) {
        const ohlc = v.ohlc ?? {};
        out[sym] = {
          price: Number(v.last_price ?? ohlc.close ?? 0),
          open: Number(ohlc.open ?? 0),
          high: Number(ohlc.high ?? 0),
          low: Number(ohlc.low ?? 0),
          close: Number(ohlc.close ?? v.last_price ?? 0),
          volume: Number(v.volume ?? 0),
        };
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Fetch Historical / Intraday Chart Candles via DhanHQ v2
 * POST https://api.dhan.co/v2/charts/intraday or /v2/charts/historical
 */
export async function getDhanChartCandles(
  symbol: string,
  range: string = "1d",
): Promise<Array<{ t: number; price: number; volume: number; open: number; high: number; low: number }> | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const securityId = getDhanSecurityId(symbol);
  if (!securityId) return null;

  const isIntraday = range === "1d" || range === "5d" || range === "1w";
  const endpoint = isIntraday ? "/v2/charts/intraday" : "/v2/charts/historical";

  const now = new Date();
  const toDateStr = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (isIntraday ? 5 * 86400_000 : 365 * 86400_000));
  const fromDateStr = from.toISOString().slice(0, 10);

  const interval = isIntraday ? "5" : "1D";

  try {
    const res = await fetch(`${DHAN_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
      body: JSON.stringify({
        securityId: String(securityId),
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval,
        fromDate: fromDateStr,
        toDate: toDateStr,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const timestamps: number[] = json?.timestamp ?? [];
    const opens: number[] = json?.open ?? [];
    const highs: number[] = json?.high ?? [];
    const lows: number[] = json?.low ?? [];
    const closes: number[] = json?.close ?? [];
    const volumes: number[] = json?.volume ?? [];

    const points: Array<{ t: number; price: number; volume: number; open: number; high: number; low: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (typeof closes[i] === "number") {
        points.push({
          t: timestamps[i] * 1000,
          price: closes[i],
          volume: volumes[i] ?? 0,
          open: opens[i] ?? closes[i],
          high: highs[i] ?? closes[i],
          low: lows[i] ?? closes[i],
        });
      }
    }
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}
