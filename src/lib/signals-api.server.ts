/**
 * Secured Trade Signals API Service.
 *
 * Normalizes signals for Indian F&O (NIFTY, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY)
 * and US F&O (SPX, NDX, DJI), with stable deterministic IDs, timing-safe API key auth,
 * automatic market routing, and rate limiting.
 */

import {
  constantTimeEqual,
  corsHeaders,
  extractApiKey,
  matchesAnyKey,
  optionsResponse,
  parseList,
  readEnv,
  sha256Hex,
} from "./api-auth.server.ts";
import { clientIp } from "./admin-session.server.ts";
import { getMarketHighProfitTrades } from "./trade-analysis.server.ts";
import type { HighProfitTradeSetup } from "./trade-analysis.ts";
import { listOrders, type PaperOrder } from "./orders-store.server.ts";

export type SupportedMarket = "INDIA_FNO" | "US_FNO";
export type InstrumentType = "OPTION" | "FUTURE";

export const SUPPORTED_INSTRUMENTS = [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "FINNIFTY",
  "MIDCPNIFTY",
  "SPX",
  "NDX",
  "DJI",
] as const;

export type SupportedInstrument = (typeof SUPPORTED_INSTRUMENTS)[number];

export const MARKET_BY_INSTRUMENT: Record<SupportedInstrument, SupportedMarket> = {
  NIFTY: "INDIA_FNO",
  BANKNIFTY: "INDIA_FNO",
  SENSEX: "INDIA_FNO",
  FINNIFTY: "INDIA_FNO",
  MIDCPNIFTY: "INDIA_FNO",
  SPX: "US_FNO",
  NDX: "US_FNO",
  DJI: "US_FNO",
};

export interface ExternalSignal {
  id: string;
  market: SupportedMarket;
  instrument: SupportedInstrument;
  instrument_type: InstrumentType;
  expiry: string;
  strike: number | null;
  option_type: "CE" | "PE" | null;
  side: "BUY" | "SELL";
  lots: number;
  price: number;
  stop_loss: number | null;
  target: number | null;
  currency: "INR" | "USD";
  created_at: string;
}

/**
 * Normalizes an arbitrary instrument / symbol string to exactly one of the supported codes:
 * NIFTY, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY, SPX, NDX, DJI.
 * Returns null if the instrument is unknown or unsupported.
 */
export function normalizeInstrument(raw: string | null | undefined): SupportedInstrument | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;

  // Exact canonical codes first
  if (s === "NIFTY" || s === "NIFTY50" || s === "NSEINDEXNIFTY50" || s === "NSEI") return "NIFTY";
  if (
    s === "BANKNIFTY" ||
    s === "NIFTYBANK" ||
    s === "NSEINDEXNIFTYBANK" ||
    s === "NSEBANK" ||
    s === "BANK"
  ) {
    return "BANKNIFTY";
  }
  if (s === "SENSEX" || s === "BSESENSEX" || s === "BSEINDEXSENSEX" || s === "BSESN") return "SENSEX";
  if (
    s === "FINNIFTY" ||
    s === "NIFTYFINSERVICE" ||
    s === "NIFTYFINANCIALSERVICES" ||
    s === "FINANCIALSERVICES" ||
    s === "CNXFINANCE"
  ) {
    return "FINNIFTY";
  }
  if (
    s === "MIDCPNIFTY" ||
    s === "MIDCAPNIFTY" ||
    s === "NIFTYMIDCAP100" ||
    s === "NIFTYMIDSELECT" ||
    s === "MIDCAP"
  ) {
    return "MIDCPNIFTY";
  }
  if (
    s === "SPX" ||
    s === "SP500" ||
    s === "GSPC" ||
    s === "ESF" ||
    s === "ES" ||
    s === "STANDARDPOORS500"
  ) {
    return "SPX";
  }
  if (
    s === "NDX" ||
    s === "NASDAQ100" ||
    s === "NAS100" ||
    s === "NQF" ||
    s === "NQ" ||
    s === "NASDAQ"
  ) {
    return "NDX";
  }
  if (
    s === "DJI" ||
    s === "DOW" ||
    s === "DOWJONES" ||
    s === "DOW30" ||
    s === "DJIA" ||
    s === "YMF" ||
    s === "YM"
  ) {
    return "DJI";
  }

  // Substring matching for descriptive labels (e.g. "BANK NIFTY 52000 CE")
  if (s.includes("BANK")) return "BANKNIFTY";
  if (s.includes("FINNIFTY") || s.includes("FINANCE")) return "FINNIFTY";
  if (s.includes("MIDCAP") || s.includes("MIDCP")) return "MIDCPNIFTY";
  if (s.includes("SENSEX")) return "SENSEX";
  if (s.includes("NIFTY")) return "NIFTY";
  if (s.includes("SP500") || s.includes("SPX")) return "SPX";
  if (s.includes("NASDAQ") || s.includes("NDX")) return "NDX";
  if (s.includes("DOW") || s.includes("DJI")) return "DJI";

  return null;
}

/**
 * Automatically routes an instrument to its market:
 * - NIFTY, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY -> INDIA_FNO
 * - SPX, NDX, DJI -> US_FNO
 */
export function getMarketForInstrument(instrument: SupportedInstrument): SupportedMarket {
  return MARKET_BY_INSTRUMENT[instrument];
}

/**
 * Normalizes an expiry date to strict "YYYY-MM-DD" format.
 * Prioritizes direct component parsing to avoid timezone-shift artifacts.
 */
export function normalizeExpiryDate(raw: string | undefined | null, fallbackDate?: Date): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    const dmy = trimmed.match(/^(\d{1,2})[-/\s]?([A-Za-z]{3,})[-/\s]?(\d{2,4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, "0");
      const monStr = dmy[2].slice(0, 3).toUpperCase();
      const months: Record<string, string> = {
        JAN: "01",
        FEB: "02",
        MAR: "03",
        APR: "04",
        MAY: "05",
        JUN: "06",
        JUL: "07",
        AUG: "08",
        SEP: "09",
        OCT: "10",
        NOV: "11",
        DEC: "12",
      };
      const month = months[monStr];
      let year = dmy[3];
      if (year.length === 2) year = `20${year}`;
      if (month) return `${year}-${month}-${day}`;
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      const dt = new Date(parsed);
      const yr = dt.getUTCFullYear();
      const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const da = String(dt.getUTCDate()).padStart(2, "0");
      return `${yr}-${mo}-${da}`;
    }
  }
  const now = fallbackDate ?? new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + ((4 + 7 - d.getDay()) % 7 || 7));
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

/**
 * Generates a unique, deterministic, and immutable ID for a signal.
 * The ID depends strictly on invariant signal attributes and creation timestamp,
 * so it will never change when queried multiple times.
 */
export function generateSignalId(
  market: SupportedMarket,
  instrument: SupportedInstrument,
  expiry: string,
  strike: number | null,
  option_type: "CE" | "PE" | null,
  side: "BUY" | "SELL",
  createdAt: string,
): string {
  const dateCompact = createdAt.slice(0, 10).replace(/-/g, "");
  const timeCompact = createdAt.slice(11, 19).replace(/[^0-9]/g, "");
  const strikePart = strike !== null ? String(strike) : "fut";
  const typePart = option_type ? option_type.toLowerCase() : "none";
  return `sig_${market.toLowerCase()}_${instrument.toLowerCase()}_${expiry}_${strikePart}_${typePart}_${side.toLowerCase()}_${dateCompact}t${timeCompact}`;
}

/**
 * Transforms an internal HighProfitTradeSetup into an ExternalSignal.
 * Rejects and logs unknown instruments.
 */
export function setupToExternalSignal(setup: HighProfitTradeSetup): ExternalSignal | null {
  const inst = normalizeInstrument(setup.symbol);
  if (!inst) {
    console.warn(`[signals-api] Rejected trade setup with unknown instrument: "${setup.symbol}"`);
    return null;
  }
  const market = getMarketForInstrument(inst);
  const currency: "INR" | "USD" = market === "INDIA_FNO" ? "INR" : "USD";

  const isFuture =
    setup.contract.toUpperCase().includes("FUT") ||
    (setup.strategy?.toUpperCase() ?? "").includes("FUT");
  const instrument_type: InstrumentType = isFuture ? "FUTURE" : "OPTION";

  let option_type: "CE" | "PE" | null = null;
  let strike: number | null = null;

  if (instrument_type === "OPTION") {
    const rawType = (setup.optionType || "").toUpperCase();
    if (
      rawType === "CE" ||
      rawType === "CALL" ||
      setup.contract.toUpperCase().includes(" CE") ||
      setup.contract.toUpperCase().includes(" CALL")
    ) {
      option_type = "CE";
    } else {
      option_type = "PE";
    }

    const match = setup.contract.match(/(\d+(?:\.\d+)?)\s*(?:CE|PE|CALL|PUT)/i);
    if (match) {
      strike = Number(match[1]);
    } else if (setup.greeks?.atmStrike) {
      strike = setup.greeks.atmStrike;
    }
  }

  const expiry = normalizeExpiryDate(setup.expiry);
  const side: "BUY" | "SELL" = setup.action === "SELL" ? "SELL" : "BUY";
  const price = +(setup.entryPrice || 0).toFixed(2);
  const stop_loss =
    setup.stopLossPrice != null && Number.isFinite(setup.stopLossPrice)
      ? +setup.stopLossPrice.toFixed(2)
      : null;
  const target =
    setup.target1 != null && Number.isFinite(setup.target1)
      ? +setup.target1.toFixed(2)
      : setup.target2 != null && Number.isFinite(setup.target2)
        ? +setup.target2.toFixed(2)
        : null;
  const createdAt = setup.createdAt || setup.generatedAt || new Date().toISOString();

  const id = generateSignalId(market, inst, expiry, strike, option_type, side, createdAt);

  return {
    id,
    market,
    instrument: inst,
    instrument_type,
    expiry,
    strike,
    option_type,
    side,
    lots: 1,
    price,
    stop_loss,
    target,
    currency,
    created_at: createdAt,
  };
}

/**
 * Transforms a PaperOrder into an ExternalSignal.
 * Rejects and logs unknown instruments.
 */
export function paperOrderToExternalSignal(order: PaperOrder): ExternalSignal | null {
  const inst = normalizeInstrument(order.symbol);
  if (!inst) {
    console.warn(`[signals-api] Rejected paper order with unknown instrument: "${order.symbol}"`);
    return null;
  }
  const market = getMarketForInstrument(inst);
  const currency: "INR" | "USD" = market === "INDIA_FNO" ? "INR" : "USD";

  const isFuture =
    order.contract.toUpperCase().includes("FUT") || order.orderType.toUpperCase().includes("FUT");
  const instrument_type: InstrumentType = isFuture ? "FUTURE" : "OPTION";

  let option_type: "CE" | "PE" | null = null;
  let strike: number | null = null;

  if (instrument_type === "OPTION") {
    if (order.contract.toUpperCase().includes("CE") || order.contract.toUpperCase().includes("CALL")) {
      option_type = "CE";
    } else if (
      order.contract.toUpperCase().includes("PE") ||
      order.contract.toUpperCase().includes("PUT")
    ) {
      option_type = "PE";
    }
    const match = order.contract.match(/(\d+(?:\.\d+)?)\s*(?:CE|PE|CALL|PUT)/i);
    if (match) {
      strike = Number(match[1]);
    }
  }

  const expiry = normalizeExpiryDate(undefined, new Date(order.timestamp));
  const side: "BUY" | "SELL" = order.action === "SELL" ? "SELL" : "BUY";
  const price = +(order.fillPrice || 0).toFixed(2);
  const stop_loss =
    order.stopLoss != null && Number.isFinite(order.stopLoss) ? +order.stopLoss.toFixed(2) : null;
  const target =
    order.target1 != null && Number.isFinite(order.target1)
      ? +order.target1.toFixed(2)
      : order.target2 != null && Number.isFinite(order.target2)
        ? +order.target2.toFixed(2)
        : null;
  const createdAt = order.timestamp || new Date().toISOString();

  const id = generateSignalId(market, inst, expiry, strike, option_type, side, createdAt);

  return {
    id,
    market,
    instrument: inst,
    instrument_type,
    expiry,
    strike,
    option_type,
    side,
    lots: 1,
    price,
    stop_loss,
    target,
    currency,
    created_at: createdAt,
  };
}

// ---------------------------------------------------------------------------
// In-Memory Ring Buffer for Broadcast / Emitted Signals
// ---------------------------------------------------------------------------

const RECORDED_SIGNALS = new Map<string, ExternalSignal>();
const MAX_RECORDED_SIGNALS = 1000;

export function recordSignal(sig: ExternalSignal): void {
  RECORDED_SIGNALS.set(sig.id, sig);
  if (RECORDED_SIGNALS.size > MAX_RECORDED_SIGNALS) {
    const oldest = RECORDED_SIGNALS.keys().next().value;
    if (oldest !== undefined) RECORDED_SIGNALS.delete(oldest);
  }
}

export function clearRecordedSignals(): void {
  RECORDED_SIGNALS.clear();
}

// ---------------------------------------------------------------------------
// Signal Fetcher with Filters
// ---------------------------------------------------------------------------

export interface FetchSignalsOptions {
  market?: SupportedMarket;
  since?: string;
}

export async function fetchAllSignals(options: FetchSignalsOptions = {}): Promise<ExternalSignal[]> {
  const signalMap = new Map<string, ExternalSignal>();

  // 1. In-memory recorded signals
  for (const s of RECORDED_SIGNALS.values()) {
    signalMap.set(s.id, s);
  }

  // 2. Persisted / executed paper orders
  try {
    const paperMarket =
      options.market === "INDIA_FNO"
        ? "NSE_FNO"
        : options.market === "US_FNO"
          ? "GLOBAL_US"
          : undefined;
    const { orders } = await listOrders(
      paperMarket ? { market: paperMarket, limit: 100 } : { limit: 100 },
    );
    for (const ord of orders) {
      const sig = paperOrderToExternalSignal(ord);
      if (sig) signalMap.set(sig.id, sig);
    }
  } catch (err) {
    console.warn("[signals-api] Failed to load paper orders:", (err as Error)?.message);
  }

  // 3. Live active setups from trade analysis engines
  const fetchIndia = !options.market || options.market === "INDIA_FNO";
  const fetchUS = !options.market || options.market === "US_FNO";

  const fetchPromises: Promise<void>[] = [];

  if (fetchIndia) {
    fetchPromises.push(
      (async () => {
        try {
          const res = await getMarketHighProfitTrades("NSE_FNO");
          for (const setup of res.setups ?? []) {
            const sig = setupToExternalSignal(setup);
            if (sig) signalMap.set(sig.id, sig);
          }
        } catch (err) {
          console.warn("[signals-api] Failed to load India setups:", (err as Error)?.message);
        }
      })(),
    );
  }

  if (fetchUS) {
    fetchPromises.push(
      (async () => {
        try {
          const res = await getMarketHighProfitTrades("GLOBAL_US");
          for (const setup of res.setups ?? []) {
            const sig = setupToExternalSignal(setup);
            if (sig) signalMap.set(sig.id, sig);
          }
        } catch (err) {
          console.warn("[signals-api] Failed to load US setups:", (err as Error)?.message);
        }
      })(),
    );
  }

  await Promise.all(fetchPromises);

  let results = Array.from(signalMap.values());

  // Filter by market
  if (options.market) {
    results = results.filter((s) => s.market === options.market);
  }

  // Filter by since
  if (options.since) {
    const sinceTime = Date.parse(options.since);
    if (!Number.isNaN(sinceTime)) {
      results = results.filter((s) => Date.parse(s.created_at) >= sinceTime);
    }
  }

  // Sort newest first
  results.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return results;
}

// ---------------------------------------------------------------------------
// Authentication (Timing-Safe, Header: x-api-key, Env: INVESTIQ_API_KEY)
// ---------------------------------------------------------------------------

export async function verifyInvestIQApiKey(
  request: Request,
): Promise<{ authorized: boolean; error?: string }> {
  const key = extractApiKey(request);
  if (!key) {
    return {
      authorized: false,
      error: "Unauthorized: Missing API key. Pass 'x-api-key: <KEY>' header.",
    };
  }

  const configured = readEnv("INVESTIQ_API_KEY");
  if (!configured) {
    // Fail closed: never authorize if INVESTIQ_API_KEY is unset or empty
    return {
      authorized: false,
      error: "Unauthorized: API key not configured or invalid.",
    };
  }

  const allowedKeys = parseList(configured);
  const matched = await matchesAnyKey(key, allowedKeys);
  if (!matched) {
    return {
      authorized: false,
      error: "Unauthorized: Invalid API key.",
    };
  }

  return { authorized: true };
}

// ---------------------------------------------------------------------------
// Rate Limiter (Sliding Window per IP / Key, bounded memory)
// ---------------------------------------------------------------------------

export interface SignalsRateLimiter {
  check(
    identifier: string,
    nowMs?: number,
  ): { allowed: boolean; remaining: number; retryAfterSeconds: number };
  reset(identifier: string): void;
}

export function createSignalsRateLimiter(maxRequests = 60, windowMs = 60_000): SignalsRateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  const prune = (now: number) => {
    if (entries.size < 500) return;
    for (const [k, v] of entries) {
      if (v.resetAt <= now) entries.delete(k);
    }
    while (entries.size > 2000) {
      const first = entries.keys().next().value;
      if (first === undefined) break;
      entries.delete(first);
    }
  };

  return {
    check(identifier: string, now = Date.now()) {
      prune(now);
      const e = entries.get(identifier);
      if (!e || e.resetAt <= now) {
        entries.set(identifier, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
      }
      if (e.count >= maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((e.resetAt - now) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      e.count += 1;
      return { allowed: true, remaining: maxRequests - e.count, retryAfterSeconds: 0 };
    },
    reset(identifier: string) {
      entries.delete(identifier);
    },
  };
}

export const signalsRateLimiter = createSignalsRateLimiter(60, 60_000);

export function checkSignalsRateLimit(
  request: Request,
  nowMs = Date.now(),
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const ip = clientIp(request);
  const key = extractApiKey(request);
  const keyPart = key ? key.slice(-8) : "nokey";
  const id = `${ip}:${keyPart}`;
  return signalsRateLimiter.check(id, nowMs);
}
