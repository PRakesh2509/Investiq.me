/**
 * DhanHQ API v2 Client (Server-only)
 * Docs: https://dhanhq.co/docs/v2/
 *
 * Full data provider for InvestIQ:
 * - Live Marketfeed Quotes, LTP, and OHLC
 * - Historical & Intraday 1m/5m/15m/60m/1D Candles (Equities & Indices)
 * - User Portfolio Holdings & Positions
 * - Fund Limits & Margins
 * - Option Chain & Greeks
 */
import dhanScripMap from "./dhan-scrip-map.json" with { type: "json" };
import fs from "fs";
import path from "path";

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
  "NIFTY MID SELECT": { id: 44, segment: "IDX_I", instrument: "INDEX" },
};

let runtimeCreds: DhanCredentials | null = null;

export function setDhanRuntimeCredentials(creds: DhanCredentials | null) {
  runtimeCreds = creds;
}

export function getDhanCredentials(): DhanCredentials | null {
  if (runtimeCreds?.clientId && runtimeCreds?.accessToken) {
    return runtimeCreds;
  }
  const clientId = process.env.DHAN_CLIENT_ID?.trim();
  const accessToken = process.env.DHAN_ACCESS_TOKEN?.trim();
  if (clientId && accessToken) {
    return { clientId, accessToken };
  }
  return null;
}

export function getDhanInstrument(symbol: string): DhanInstrumentTarget | null {
  const clean = symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").replace(/[^A-Z0-9&-]/g, "").toUpperCase();
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

export async function testDhanConnection(
  creds: DhanCredentials,
): Promise<{ ok: boolean; message?: string }> {
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
        NSE_EQ: [2885], // RELIANCE
      }),
    });

    if (res.status === 200) {
      const json = (await res.json()) as any;
      if (json?.status === "success" || json?.data) {
        return { ok: true, message: "DhanHQ API authenticated successfully" };
      }
    }

    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      message: `DhanHQ returned status ${res.status}: ${errText.slice(0, 100) || "Invalid credentials or expired token"}`,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach DhanHQ servers" };
  }
}

export function persistDhanCredentials(creds: DhanCredentials): boolean {
  try {
    setDhanRuntimeCredentials(creds);
    process.env.DHAN_CLIENT_ID = creds.clientId;
    process.env.DHAN_ACCESS_TOKEN = creds.accessToken;

    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf8");
      if (content.includes("DHAN_CLIENT_ID=")) {
        content = content.replace(/DHAN_CLIENT_ID=.*/g, `DHAN_CLIENT_ID="${creds.clientId}"`);
      } else {
        content += `\nDHAN_CLIENT_ID="${creds.clientId}"`;
      }
      if (content.includes("DHAN_ACCESS_TOKEN=")) {
        content = content.replace(/DHAN_ACCESS_TOKEN=.*/g, `DHAN_ACCESS_TOKEN="${creds.accessToken}"`);
      } else {
        content += `\nDHAN_ACCESS_TOKEN="${creds.accessToken}"`;
      }
      fs.writeFileSync(envPath, content, "utf8");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch LTP for multiple symbols via DhanHQ v2
 * POST https://api.dhan.co/v2/marketfeed/ltp
 */
export async function getDhanLtp(symbols: string[]): Promise<Record<string, number> | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const nseEqIds: number[] = [];
  const idxIds: number[] = [];
  const idToSym: Record<number, string> = {};

  for (const s of symbols) {
    const target = getDhanInstrument(s);
    if (target) {
      if (target.segment === "IDX_I") {
        idxIds.push(target.id);
      } else {
        nseEqIds.push(target.id);
      }
      idToSym[target.id] = s.replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();
    }
  }

  if (!nseEqIds.length && !idxIds.length) return null;

  const payload: Record<string, number[]> = {};
  if (nseEqIds.length) payload.NSE_EQ = nseEqIds;
  if (idxIds.length) payload.IDX_I = idxIds;

  try {
    const res = await fetch(`${DHAN_BASE}/v2/marketfeed/ltp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const data = json?.data ?? {};
    const nseEqData = data.NSE_EQ ?? {};
    const idxData = data.IDX_I ?? {};

    const out: Record<string, number> = {};
    for (const [idStr, val] of Object.entries(nseEqData)) {
      const sym = idToSym[Number(idStr)];
      if (sym && typeof (val as any)?.last_price === "number") {
        out[sym] = (val as any).last_price;
      }
    }
    for (const [idStr, val] of Object.entries(idxData)) {
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

  const nseEqIds: number[] = [];
  const idxIds: number[] = [];
  const idToSym: Record<number, string> = {};

  for (const s of symbols) {
    const target = getDhanInstrument(s);
    if (target) {
      if (target.segment === "IDX_I") {
        idxIds.push(target.id);
      } else {
        nseEqIds.push(target.id);
      }
      idToSym[target.id] = s.replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();
    }
  }

  if (!nseEqIds.length && !idxIds.length) return null;

  const payload: Record<string, number[]> = {};
  if (nseEqIds.length) payload.NSE_EQ = nseEqIds;
  if (idxIds.length) payload.IDX_I = idxIds;

  try {
    const res = await fetch(`${DHAN_BASE}/v2/marketfeed/ohlc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const data = json?.data ?? {};
    const nseEqData = data.NSE_EQ ?? {};
    const idxData = data.IDX_I ?? {};

    const out: Record<
      string,
      { price: number; open: number; high: number; low: number; close: number; volume: number }
    > = {};

    const processEntries = (dict: Record<string, any>) => {
      for (const [idStr, val] of Object.entries(dict)) {
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
    };

    processEntries(nseEqData);
    processEntries(idxData);

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
  intervalMinutes?: number,
): Promise<Array<{ t: number; price: number; volume: number; open: number; high: number; low: number }> | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const target = getDhanInstrument(symbol);
  if (!target) return null;

  const isIntraday = range === "1d" || range === "5d" || range === "1w";
  const endpoint = isIntraday ? "/v2/charts/intraday" : "/v2/charts/historical";

  const now = new Date();
  const toDateStr = now.toISOString().slice(0, 10);
  const daysBack =
    range === "1d" ? 2 :
    range === "5d" || range === "1w" ? 7 :
    range === "1mo" ? 30 :
    range === "3mo" ? 90 :
    range === "6mo" ? 180 :
    range === "1y" ? 365 : 730;

  const from = new Date(now.getTime() - daysBack * 86400_000);
  const fromDateStr = from.toISOString().slice(0, 10);

  let intervalStr = "5";
  if (isIntraday) {
    if (intervalMinutes === 1) intervalStr = "1";
    else if (intervalMinutes === 15) intervalStr = "15";
    else if (intervalMinutes === 25 || intervalMinutes === 30) intervalStr = "25";
    else if (intervalMinutes === 60) intervalStr = "60";
    else intervalStr = "5";
  } else {
    intervalStr = "1D";
  }

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
        securityId: String(target.id),
        exchangeSegment: target.segment,
        instrument: target.instrument,
        interval: intervalStr,
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
        const rawT = timestamps[i];
        // Dhan timestamps can be seconds or milliseconds
        const tMs = rawT > 1e11 ? rawT : rawT * 1000;
        points.push({
          t: tMs,
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

/**
 * Fetch raw holdings from DhanHQ
 * GET https://api.dhan.co/v2/holdings (or /holdings)
 */
export async function getDhanRawHoldings(): Promise<any[] | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  try {
    let res = await fetch(`${DHAN_BASE}/v2/holdings`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
    });

    if (!res.ok) {
      res = await fetch(`${DHAN_BASE}/holdings`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "client-id": creds.clientId,
          "access-token": creds.accessToken,
        },
      });
    }

    if (!res.ok) return null;
    const json = await res.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return null;
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
  const envClientId = process.env.DHAN_CLIENT_ID?.trim() || "1114340693";

  if (!creds) {
    return {
      ok: true,
      connected: false,
      isDemo: true,
      clientId: envClientId,
      holdings: DEMO_DHAN_HOLDINGS,
      summary: DEMO_DHAN_SUMMARY,
      message: "Showing DhanHQ preview portfolio. Connect your DhanHQ token to sync live assets.",
    };
  }

  const raw = await getDhanRawHoldings();
  if (!raw) {
    return {
      ok: true,
      connected: false,
      isDemo: true,
      clientId: creds.clientId,
      holdings: DEMO_DHAN_HOLDINGS,
      summary: DEMO_DHAN_SUMMARY,
      message: "Failed to fetch live DhanHQ holdings. Using sample portfolio.",
    };
  }

  if (raw.length === 0) {
    return {
      ok: true,
      connected: true,
      isDemo: false,
      clientId: creds.clientId,
      holdings: [],
      summary: { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 },
      message: "DhanHQ account connected. No active holdings found.",
    };
  }

  // Get live prices for held symbols
  const syms = raw.map((h: any) => h.tradingSymbol || h.symbolName).filter(Boolean);
  const ltpMap = (await getDhanLtp(syms)) ?? {};

  const enriched: DhanHolding[] = raw.map((h: any) => {
    const sym = (h.tradingSymbol || h.symbolName || `SCRIP-${h.securityId}`).toUpperCase();
    const qty = Number(h.totalQty ?? h.dpQty ?? h.availableQty ?? h.quantity ?? 0);
    const avg = Number(h.avgCostPrice ?? h.averagePrice ?? 0);
    const ltp = Number(ltpMap[sym] ?? h.closePrice ?? avg ?? 0);

    const invested = +(qty * avg).toFixed(2);
    const current = +(qty * ltp).toFixed(2);
    const pnl = +(current - invested).toFixed(2);
    const pnlPct = invested > 0 ? +((pnl / invested) * 100).toFixed(2) : 0;
    const dayChangePct = avg > 0 ? +(((ltp - avg) / avg) * 100).toFixed(2) : 0;

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
      securityId: String(h.securityId || ""),
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

/**
 * Fetch positions from DhanHQ v2
 * GET https://api.dhan.co/v2/positions
 */
export async function getDhanPositions(): Promise<any[] | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  try {
    let res = await fetch(`${DHAN_BASE}/v2/positions`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
    });
    if (!res.ok) {
      res = await fetch(`${DHAN_BASE}/positions`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "client-id": creds.clientId,
          "access-token": creds.accessToken,
        },
      });
    }
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json) ? json : json?.data ?? [];
  } catch {
    return null;
  }
}

/**
 * Fetch fund limits / margin from DhanHQ v2
 * GET https://api.dhan.co/v2/fundlimit
 */
export async function getDhanFundLimits(): Promise<any | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  try {
    let res = await fetch(`${DHAN_BASE}/v2/fundlimit`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
    });
    if (!res.ok) {
      res = await fetch(`${DHAN_BASE}/fundlimit`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "client-id": creds.clientId,
          "access-token": creds.accessToken,
        },
      });
    }
    if (!res.ok) return null;
    return await res.json();
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
  const clean = symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();
  const d = ohlc?.[clean];
  if (!d) return null;

  const change = +(d.price - d.open).toFixed(2);
  const changePct = d.open > 0 ? +((change / d.open) * 100).toFixed(2) : 0;

  return {
    symbol: clean,
    price: d.price,
    open: d.open,
    high: d.high,
    low: d.low,
    prevClose: d.open,
    volume: d.volume,
    change,
    changePct,
  };
}

/**
 * Fetch Option Chain via DhanHQ v2
 * POST https://api.dhan.co/v2/optionchain
 */
export async function getDhanOptionChain(underlying: string, expiryDate?: string): Promise<any | null> {
  const creds = getDhanCredentials();
  if (!creds) return null;

  const target = getDhanInstrument(underlying);
  if (!target) return null;

  try {
    const res = await fetch(`${DHAN_BASE}/v2/optionchain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": creds.clientId,
        "access-token": creds.accessToken,
      },
      body: JSON.stringify({
        UnderlyingScrip: target.id,
        UnderlyingSeg: target.segment,
        Expiry: expiryDate || "",
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
