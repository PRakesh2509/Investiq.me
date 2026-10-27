/**
 * Defensive parsers (zod) for upstream market-data payloads.
 *
 * Every parser takes `unknown` and returns either a normalised structure or null. None of them
 * throw. Like provider-utils.ts this file is pure so it can run under `node --test`.
 */
import { z } from "zod";

/** number | numeric string | null | undefined -> number | undefined (never NaN). */
const optNum = z
  .preprocess((v) => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().optional())
  .catch(undefined);

const optStr = z.string().optional().catch(undefined);
const nullableNumArray = z.array(z.number().nullable().catch(null)).optional().catch(undefined);

/** `{ raw: 1.2, fmt: "1.2" }` | number | string -> number (0 when absent). */
export function rawNum(o: unknown): number {
  if (typeof o === "number") return Number.isFinite(o) ? o : 0;
  if (typeof o === "string") {
    const n = Number(o);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof o === "object" && o !== null && "raw" in o) return rawNum((o as { raw: unknown }).raw);
  return 0;
}

export function rawFmt(o: unknown): string {
  if (typeof o === "object" && o !== null && "fmt" in o) {
    const f = (o as { fmt: unknown }).fmt;
    return typeof f === "string" ? f : "";
  }
  return typeof o === "string" || typeof o === "number" ? String(o) : "";
}

/* ----------------------------------------------------------------------------------------- */
/* Yahoo Finance v8 chart                                                                    */
/* ----------------------------------------------------------------------------------------- */

const YahooMetaSchema = z
  .object({
    currency: optStr,
    symbol: optStr,
    longName: optStr,
    shortName: optStr,
    regularMarketPrice: optNum,
    regularMarketTime: optNum,
    regularMarketDayHigh: optNum,
    regularMarketDayLow: optNum,
    regularMarketVolume: optNum,
    chartPreviousClose: optNum,
    previousClose: optNum,
    fiftyTwoWeekHigh: optNum,
    fiftyTwoWeekLow: optNum,
    exchangeTimezoneName: optStr,
  })
  .passthrough();

const YahooResultSchema = z.object({
  meta: YahooMetaSchema.catch({}),
  timestamp: z.array(z.number()).optional().catch(undefined),
  indicators: z
    .object({
      quote: z
        .array(
          z.object({
            open: nullableNumArray,
            high: nullableNumArray,
            low: nullableNumArray,
            close: nullableNumArray,
            volume: nullableNumArray,
          }),
        )
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const YahooChartEnvelope = z.object({
  chart: z.object({
    result: z.array(YahooResultSchema).nullable().optional(),
  }),
});

export type YahooMeta = z.infer<typeof YahooMetaSchema>;

export interface YahooBar {
  /** unix seconds */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Collapse every `factor` consecutive bars into one (OHLCV aggregation). */
export function aggregateBars(bars: YahooBar[], factor: number): YahooBar[] {
  if (factor <= 1) return bars;
  const out: YahooBar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (chunk.length === 0) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + b.volume, 0),
    });
  }
  return out;
}

export interface YahooChartData {
  meta: YahooMeta;
  /** Fully-formed OHLC bars only. */
  bars: YahooBar[];
  /** Every timestamp with a numeric close (open/high/low may be missing). */
  points: Array<{ time: number; close: number; volume: number }>;
}

export function parseYahooChart(json: unknown): YahooChartData | null {
  const env = YahooChartEnvelope.safeParse(json);
  if (!env.success) return null;
  const r = env.data.chart.result?.[0];
  if (!r) return null;
  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0];
  const bars: YahooBar[] = [];
  const points: Array<{ time: number; close: number; volume: number }> = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q?.open?.[i];
    const h = q?.high?.[i];
    const l = q?.low?.[i];
    const c = q?.close?.[i];
    const v = q?.volume?.[i];
    if (typeof c !== "number" || !Number.isFinite(c)) continue;
    const volume = typeof v === "number" && Number.isFinite(v) ? v : 0;
    points.push({ time: ts[i], close: c, volume });
    if (typeof o === "number" && typeof h === "number" && typeof l === "number") {
      bars.push({ time: ts[i], open: o, high: h, low: l, close: c, volume });
    }
  }
  return { meta: r.meta, bars, points };
}

/** quoteSummary / search style envelopes where each module is a free-form record. */
const ModuleRecord = z.record(z.unknown()).optional().catch(undefined);

const YahooSummaryEnvelope = z.object({
  quoteSummary: z.object({
    result: z
      .array(
        z.object({
          summaryDetail: ModuleRecord,
          defaultKeyStatistics: ModuleRecord,
          financialData: ModuleRecord,
          price: ModuleRecord,
          assetProfile: ModuleRecord,
          topHoldings: z
            .object({
              sectorWeightings: z.array(z.record(z.unknown())).optional().catch(undefined),
              holdings: z.array(z.record(z.unknown())).optional().catch(undefined),
            })
            .optional()
            .catch(undefined),
        }),
      )
      .nullable()
      .optional(),
  }),
});

export type YahooSummary = NonNullable<
  NonNullable<z.infer<typeof YahooSummaryEnvelope>["quoteSummary"]["result"]>[number]
>;

export function parseYahooSummary(json: unknown): YahooSummary | null {
  const env = YahooSummaryEnvelope.safeParse(json);
  if (!env.success) return null;
  return env.data.quoteSummary.result?.[0] ?? null;
}

const YahooTimeseriesEnvelope = z.object({
  timeseries: z.object({
    result: z
      .array(
        z
          .object({
            meta: z
              .object({ type: z.array(z.string()).optional() })
              .optional()
              .catch(undefined),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  }),
});

export function parseYahooTimeseries(
  json: unknown,
): Record<string, Array<Record<string, unknown>>> {
  const env = YahooTimeseriesEnvelope.safeParse(json);
  const out: Record<string, Array<Record<string, unknown>>> = {};
  if (!env.success) return out;
  for (const r of env.data.timeseries.result ?? []) {
    const t = r.meta?.type?.[0];
    if (!t) continue;
    const rows = (r as Record<string, unknown>)[t];
    out[t] = Array.isArray(rows)
      ? rows.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      : [];
  }
  return out;
}

export interface YahooNewsItem {
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  thumbnail: string;
}

const YahooNewsEnvelope = z.object({
  news: z
    .array(
      z
        .object({
          title: optStr,
          publisher: optStr,
          link: optStr,
          providerPublishTime: optNum,
          thumbnail: z
            .object({
              resolutions: z
                .array(z.object({ url: optStr }))
                .optional()
                .catch(undefined),
            })
            .optional()
            .catch(undefined),
        })
        .passthrough(),
    )
    .optional(),
});

export function parseYahooNews(json: unknown): YahooNewsItem[] {
  const env = YahooNewsEnvelope.safeParse(json);
  if (!env.success) return [];
  return (env.data.news ?? []).map((n) => ({
    title: n.title ?? "",
    publisher: n.publisher ?? "",
    link: n.link ?? "",
    providerPublishTime: (n.providerPublishTime ?? 0) * 1000,
    thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? "",
  }));
}

/* ----------------------------------------------------------------------------------------- */
/* DhanHQ v2                                                                                 */
/* ----------------------------------------------------------------------------------------- */

const DhanSegmentMap = z.record(z.record(z.unknown())).optional().catch(undefined);
const DhanMarketFeedEnvelope = z.object({
  data: z
    .object({
      NSE_EQ: DhanSegmentMap,
      IDX_I: DhanSegmentMap,
      BSE_EQ: DhanSegmentMap,
      NSE_FNO: DhanSegmentMap,
    })
    .optional()
    .catch(undefined),
});

export interface DhanQuoteRow {
  segment: string;
  securityId: number;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  /** Dhan's ohlc.close is the previous session close while the market is live. */
  close: number;
  volume: number;
}

/** Parses both /marketfeed/ltp and /marketfeed/ohlc responses. */
export function parseDhanMarketFeed(json: unknown): DhanQuoteRow[] {
  const env = DhanMarketFeedEnvelope.safeParse(json);
  if (!env.success || !env.data.data) return [];
  const rows: DhanQuoteRow[] = [];
  for (const [segment, byId] of Object.entries(env.data.data)) {
    if (!byId) continue;
    for (const [idStr, raw] of Object.entries(byId)) {
      const id = Number(idStr);
      if (!Number.isFinite(id)) continue;
      const ohlc = (typeof raw.ohlc === "object" && raw.ohlc !== null ? raw.ohlc : {}) as Record<
        string,
        unknown
      >;
      const last = rawNum(raw.last_price);
      rows.push({
        segment,
        securityId: id,
        lastPrice: last,
        open: rawNum(ohlc.open),
        high: rawNum(ohlc.high),
        low: rawNum(ohlc.low),
        close: rawNum(ohlc.close),
        volume: rawNum(raw.volume),
      });
    }
  }
  return rows;
}

export interface DhanCandle {
  /** epoch ms */
  t: number;
  price: number;
  volume: number;
  open: number;
  high: number;
  low: number;
}

const DhanCandlesEnvelope = z.object({
  timestamp: nullableNumArray,
  open: nullableNumArray,
  high: nullableNumArray,
  low: nullableNumArray,
  close: nullableNumArray,
  volume: nullableNumArray,
});

export function parseDhanCandles(json: unknown): DhanCandle[] {
  const env = DhanCandlesEnvelope.safeParse(json);
  if (!env.success) return [];
  const { timestamp = [], open = [], high = [], low = [], close = [], volume = [] } = env.data;
  const out: DhanCandle[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const rawT = timestamp[i];
    const c = close[i];
    if (typeof rawT !== "number" || typeof c !== "number" || !Number.isFinite(c)) continue;
    // Dhan may return seconds or milliseconds.
    const t = rawT > 1e11 ? rawT : rawT * 1000;
    out.push({
      t,
      price: c,
      volume: volume[i] ?? 0,
      open: open[i] ?? c,
      high: high[i] ?? c,
      low: low[i] ?? c,
    });
  }
  return out;
}

export interface ParsedChainLeg {
  ltp?: number;
  oi?: number;
  prevOi?: number;
  volume?: number;
  iv?: number;
  bid?: number;
  bidQty?: number;
  ask?: number;
  askQty?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface ParsedChainRow {
  strike: number;
  ce: ParsedChainLeg;
  pe: ParsedChainLeg;
}

export interface ParsedDhanChain {
  spot?: number;
  expiry?: string;
  rows: ParsedChainRow[];
}

const DhanLegSchema = z
  .object({
    last_price: optNum,
    ltp: optNum,
    oi: optNum,
    open_interest: optNum,
    previous_oi: optNum,
    prev_oi: optNum,
    oi_day_change: optNum,
    oi_change: optNum,
    volume: optNum,
    implied_volatility: optNum,
    iv: optNum,
    top_bid_price: optNum,
    bid_price: optNum,
    best_bid: optNum,
    top_bid_quantity: optNum,
    bid_qty: optNum,
    top_ask_price: optNum,
    ask_price: optNum,
    best_ask: optNum,
    top_ask_quantity: optNum,
    ask_qty: optNum,
    greeks: z
      .object({ delta: optNum, gamma: optNum, theta: optNum, vega: optNum })
      .optional()
      .catch(undefined),
  })
  .passthrough();

function legFrom(raw: unknown): ParsedChainLeg {
  const p = DhanLegSchema.safeParse(raw ?? {});
  if (!p.success) return {};
  const l = p.data;
  const oi = l.oi ?? l.open_interest;
  const prevOi =
    l.previous_oi ??
    l.prev_oi ??
    (oi !== undefined && l.oi_day_change !== undefined
      ? oi - l.oi_day_change
      : oi !== undefined && l.oi_change !== undefined
        ? oi - l.oi_change
        : undefined);
  return {
    ltp: l.last_price ?? l.ltp,
    oi,
    prevOi,
    volume: l.volume,
    iv: l.implied_volatility ?? l.iv,
    bid: l.top_bid_price ?? l.bid_price ?? l.best_bid,
    bidQty: l.top_bid_quantity ?? l.bid_qty,
    ask: l.top_ask_price ?? l.ask_price ?? l.best_ask,
    askQty: l.top_ask_quantity ?? l.ask_qty,
    delta: l.greeks?.delta,
    gamma: l.greeks?.gamma,
    theta: l.greeks?.theta,
    vega: l.greeks?.vega,
  };
}

const DhanChainBody = z
  .object({
    last_price: optNum,
    spot: optNum,
    underlying_spot_price: optNum,
    expiry: optStr,
    expiry_date: optStr,
    // v2 returns an object keyed by strike ("25650.000000"); older docs showed an array.
    oc: z
      .union([z.record(z.unknown()), z.array(z.unknown())])
      .optional()
      .catch(undefined),
    option_chains: z.array(z.unknown()).optional().catch(undefined),
  })
  .passthrough();

export function parseDhanOptionChain(json: unknown): ParsedDhanChain | null {
  const root = z.object({ data: z.unknown().optional() }).passthrough().safeParse(json);
  if (!root.success) return null;
  const bodyRaw = root.data.data ?? json;
  const body = DhanChainBody.safeParse(bodyRaw);
  if (!body.success) return null;
  const b = body.data;
  const rows: ParsedChainRow[] = [];

  const ocRaw = b.oc ?? b.option_chains;
  if (Array.isArray(ocRaw)) {
    for (const item of ocRaw) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      const strike = rawNum(rec.strike_price ?? rec.strike);
      if (strike <= 0) continue;
      rows.push({
        strike,
        ce: legFrom(rec.ce ?? rec.call_option),
        pe: legFrom(rec.pe ?? rec.put_option),
      });
    }
  } else if (ocRaw && typeof ocRaw === "object") {
    for (const [strikeKey, item] of Object.entries(ocRaw)) {
      const strike = Number(strikeKey);
      if (!Number.isFinite(strike) || strike <= 0 || typeof item !== "object" || item === null)
        continue;
      const rec = item as Record<string, unknown>;
      rows.push({
        strike,
        ce: legFrom(rec.ce ?? rec.call_option),
        pe: legFrom(rec.pe ?? rec.put_option),
      });
    }
  }
  rows.sort((a, b2) => a.strike - b2.strike);
  if (rows.length === 0) return null;
  return {
    spot: b.last_price ?? b.spot ?? b.underlying_spot_price,
    expiry: b.expiry ?? b.expiry_date,
    rows,
  };
}

export function parseDhanExpiryList(json: unknown): string[] {
  const env = z.object({ data: z.array(z.unknown()).optional().catch(undefined) }).safeParse(json);
  if (!env.success) return [];
  return (env.data.data ?? [])
    .filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x))
    .sort();
}

const DhanHoldingSchema = z
  .object({
    tradingSymbol: optStr,
    symbolName: optStr,
    securityId: z.union([z.string(), z.number()]).optional().catch(undefined),
    isin: optStr,
    exchange: optStr,
    totalQty: optNum,
    dpQty: optNum,
    availableQty: optNum,
    quantity: optNum,
    avgCostPrice: optNum,
    averagePrice: optNum,
    closePrice: optNum,
  })
  .passthrough();

export type DhanRawHolding = z.infer<typeof DhanHoldingSchema>;

/** Accepts `[...]` or `{ data: [...] }`. Returns null when the shape is unrecognised. */
export function parseDhanHoldings(json: unknown): DhanRawHolding[] | null {
  const arr = Array.isArray(json)
    ? json
    : typeof json === "object" && json !== null && Array.isArray((json as { data?: unknown }).data)
      ? (json as { data: unknown[] }).data
      : null;
  if (!arr) return null;
  const out: DhanRawHolding[] = [];
  for (const item of arr) {
    const p = DhanHoldingSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}

/* ----------------------------------------------------------------------------------------- */
/* CBOE delayed quotes (global index option chains)                                          */
/* ----------------------------------------------------------------------------------------- */

export interface ParsedGlobalOption {
  expiry: string; // YYYY-MM-DD
  type: "CE" | "PE";
  strike: number;
  leg: ParsedChainLeg;
}

export interface ParsedGlobalChain {
  spot?: number;
  /** ms epoch of the feed timestamp when provided */
  timestampMs?: number;
  options: ParsedGlobalOption[];
}

const CboeOptionSchema = z
  .object({
    option: z.string(),
    bid: optNum,
    bid_size: optNum,
    ask: optNum,
    ask_size: optNum,
    iv: optNum,
    open_interest: optNum,
    volume: optNum,
    delta: optNum,
    gamma: optNum,
    theta: optNum,
    vega: optNum,
    last_trade_price: optNum,
    prev_day_close: optNum,
  })
  .passthrough();

const CboeEnvelope = z.object({
  timestamp: optStr,
  data: z.object({
    current_price: optNum,
    close: optNum,
    options: z.array(z.unknown()),
  }),
});

const OCC_RE = /^(.+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function parseOccSymbol(
  sym: string,
): { expiry: string; type: "CE" | "PE"; strike: number } | null {
  const m = OCC_RE.exec(sym.trim());
  if (!m) return null;
  const [, , yy, mm, dd, cp, strikeRaw] = m;
  const expiry = `20${yy}-${mm}-${dd}`;
  const strike = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return { expiry, type: cp === "C" ? "CE" : "PE", strike };
}

export function parseCboeChain(json: unknown): ParsedGlobalChain | null {
  const env = CboeEnvelope.safeParse(json);
  if (!env.success) return null;
  const options: ParsedGlobalOption[] = [];
  for (const raw of env.data.data.options) {
    const p = CboeOptionSchema.safeParse(raw);
    if (!p.success) continue;
    const occ = parseOccSymbol(p.data.option);
    if (!occ) continue;
    const o = p.data;
    options.push({
      expiry: occ.expiry,
      type: occ.type,
      strike: occ.strike,
      leg: {
        ltp: o.last_trade_price,
        oi: o.open_interest,
        volume: o.volume,
        iv: o.iv !== undefined ? o.iv * 100 : undefined, // CBOE reports IV as a fraction
        bid: o.bid,
        bidQty: o.bid_size,
        ask: o.ask,
        askQty: o.ask_size,
        delta: o.delta,
        gamma: o.gamma,
        theta: o.theta,
        vega: o.vega,
      },
    });
  }
  if (options.length === 0) return null;
  const ts = env.data.timestamp ? Date.parse(env.data.timestamp.replace(" ", "T") + "Z") : NaN;
  return {
    spot: env.data.data.current_price ?? env.data.data.close,
    timestampMs: Number.isFinite(ts) ? ts : undefined,
    options,
  };
}

export interface ParsedGlobalChainText extends ParsedGlobalChain {
  /** Every expiry present in the payload (YYYY-MM-DD, ascending). */
  expiries: string[];
  /** The expiry the `options` array was extracted for. */
  expiry?: string;
}

/**
 * Memory-friendly CBOE parser. The delayed-quote file for SPX is >10 MB / ~30k contracts, so it is
 * scanned as text and only the contracts of ONE expiry (within +/- `windowPct` of spot) are
 * JSON-parsed.
 *
 * `pickExpiry` receives the sorted expiry list and returns the one to extract.
 */
export function parseCboeChainText(
  text: string,
  pickExpiry: (expiries: string[]) => string | undefined,
  windowPct = 0.12,
): ParsedGlobalChainText | null {
  const expirySet = new Set<string>();
  const nameRe = /"option"\s*:\s*"[A-Z]+(\d{2})(\d{2})(\d{2})[CP]/g;
  for (let m = nameRe.exec(text); m !== null; m = nameRe.exec(text)) {
    expirySet.add(`20${m[1]}-${m[2]}-${m[3]}`);
  }
  if (expirySet.size === 0) return null;
  const expiries = [...expirySet].sort();
  const expiry = pickExpiry(expiries);
  if (!expiry) return null;

  const spotMatch = /"current_price"\s*:\s*([0-9.]+)/.exec(text);
  const spot = spotMatch ? Number(spotMatch[1]) : undefined;
  const tsMatch = /"timestamp"\s*:\s*"([^"]+)"/.exec(text);
  const ts = tsMatch ? Date.parse(tsMatch[1].replace(" ", "T") + "Z") : NaN;

  const code = expiry.slice(2).replace(/-/g, "");
  const objRe = new RegExp(String.raw`\{"option"\s*:\s*"[A-Z]+${code}[CP]\d{8}"[^{}]*\}`, "g");
  const options: ParsedGlobalOption[] = [];
  for (let m = objRe.exec(text); m !== null; m = objRe.exec(text)) {
    let raw: unknown;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      continue;
    }
    const p = CboeOptionSchema.safeParse(raw);
    if (!p.success) continue;
    const occ = parseOccSymbol(p.data.option);
    if (!occ) continue;
    if (spot && Math.abs(occ.strike - spot) / spot > windowPct) continue;
    const o = p.data;
    options.push({
      expiry: occ.expiry,
      type: occ.type,
      strike: occ.strike,
      leg: {
        ltp: o.last_trade_price,
        oi: o.open_interest,
        volume: o.volume,
        iv: o.iv !== undefined ? o.iv * 100 : undefined,
        bid: o.bid,
        bidQty: o.bid_size,
        ask: o.ask,
        askQty: o.ask_size,
        delta: o.delta,
        gamma: o.gamma,
        theta: o.theta,
        vega: o.vega,
      },
    });
  }
  if (options.length === 0) return null;
  return { spot, timestampMs: Number.isFinite(ts) ? ts : undefined, options, expiries, expiry };
}

/* ----------------------------------------------------------------------------------------- */
/* Sensibull authorized-partner payload                                                      */
/* ----------------------------------------------------------------------------------------- */

export interface PartnerGreekRow {
  strike: number;
  callDelta: number;
  putDelta: number;
  callGamma: number;
  putGamma: number;
  callTheta: number;
  putTheta: number;
  callVega: number;
  putVega: number;
  callIv: number;
  putIv: number;
  callLtp: number;
  putLtp: number;
}

const PartnerRowSchema = z
  .object({
    strike: optNum,
    call_delta: optNum,
    ce_delta: optNum,
    put_delta: optNum,
    pe_delta: optNum,
    call_gamma: optNum,
    put_gamma: optNum,
    gamma: optNum,
    call_theta: optNum,
    ce_theta: optNum,
    put_theta: optNum,
    pe_theta: optNum,
    call_vega: optNum,
    put_vega: optNum,
    vega: optNum,
    call_iv: optNum,
    ce_iv: optNum,
    put_iv: optNum,
    pe_iv: optNum,
    call_ltp: optNum,
    put_ltp: optNum,
  })
  .passthrough();

export function parseSensibullPartnerGreeks(json: unknown): PartnerGreekRow[] {
  const env = z.object({ data: z.array(z.unknown()).optional().catch(undefined) }).safeParse(json);
  if (!env.success) return [];
  const out: PartnerGreekRow[] = [];
  for (const raw of env.data.data ?? []) {
    const p = PartnerRowSchema.safeParse(raw);
    if (!p.success || !p.data.strike || p.data.strike <= 0) continue;
    const r = p.data;
    out.push({
      strike: r.strike as number,
      callDelta: r.call_delta ?? r.ce_delta ?? 0,
      putDelta: r.put_delta ?? r.pe_delta ?? 0,
      callGamma: r.call_gamma ?? r.gamma ?? 0,
      putGamma: r.put_gamma ?? r.gamma ?? 0,
      callTheta: r.call_theta ?? r.ce_theta ?? 0,
      putTheta: r.put_theta ?? r.pe_theta ?? 0,
      callVega: r.call_vega ?? r.vega ?? 0,
      putVega: r.put_vega ?? r.vega ?? 0,
      callIv: r.call_iv ?? r.ce_iv ?? 0,
      putIv: r.put_iv ?? r.pe_iv ?? 0,
      callLtp: r.call_ltp ?? 0,
      putLtp: r.put_ltp ?? 0,
    });
  }
  return out.sort((a, b) => a.strike - b.strike);
}

/* ----------------------------------------------------------------------------------------- */
/* Upstox v2                                                                                 */
/* ----------------------------------------------------------------------------------------- */

const UpstoxContractEnvelope = z.object({
  data: z
    .array(
      z
        .object({ expiry: z.union([z.string(), z.number()]).optional().catch(undefined) })
        .passthrough(),
    )
    .optional()
    .catch(undefined),
});

export function parseUpstoxExpiries(json: unknown): string[] {
  const env = UpstoxContractEnvelope.safeParse(json);
  if (!env.success) return [];
  const set = new Set<string>();
  for (const r of env.data.data ?? [])
    if (r.expiry !== undefined && r.expiry !== "") set.add(String(r.expiry));
  return [...set].sort();
}

const UpstoxSideSchema = z
  .object({
    instrument_key: optStr,
    market_data: z
      .object({
        ltp: optNum,
        close_price: optNum,
        volume: optNum,
        oi: optNum,
        prev_oi: optNum,
        bid_price: optNum,
        bid_qty: optNum,
        ask_price: optNum,
        ask_qty: optNum,
      })
      .optional()
      .catch(undefined),
    option_greeks: z
      .object({ iv: optNum, delta: optNum, gamma: optNum, theta: optNum, vega: optNum })
      .optional()
      .catch(undefined),
  })
  .optional()
  .catch(undefined);

export type UpstoxSideRaw = NonNullable<z.infer<typeof UpstoxSideSchema>>;

const UpstoxChainEnvelope = z.object({
  data: z
    .array(
      z.object({
        strike_price: optNum,
        underlying_spot_price: optNum,
        call_options: UpstoxSideSchema,
        put_options: UpstoxSideSchema,
      }),
    )
    .optional()
    .catch(undefined),
});

export type UpstoxChainRowRaw = NonNullable<z.infer<typeof UpstoxChainEnvelope>["data"]>[number];

export function parseUpstoxChain(json: unknown): UpstoxChainRowRaw[] {
  const env = UpstoxChainEnvelope.safeParse(json);
  return env.success ? (env.data.data ?? []) : [];
}

const UpstoxSearchEnvelope = z.object({
  data: z
    .array(
      z
        .object({
          instrument_key: optStr,
          trading_symbol: optStr,
          name: optStr,
          segment: optStr,
          instrument_type: optStr,
        })
        .passthrough(),
    )
    .optional()
    .catch(undefined),
});

export function parseUpstoxSearch(json: unknown) {
  const env = UpstoxSearchEnvelope.safeParse(json);
  return env.success ? (env.data.data ?? []) : [];
}

export function parseUpstoxFeedUri(json: unknown): string | null {
  const env = z
    .object({
      data: z
        .object({ authorized_redirect_uri: optStr, authorizedRedirectUri: optStr })
        .optional()
        .catch(undefined),
    })
    .safeParse(json);
  if (!env.success) return null;
  return env.data.data?.authorized_redirect_uri ?? env.data.data?.authorizedRedirectUri ?? null;
}

export function upstoxErrorDetail(json: unknown, fallbackText: string): string {
  const env = z
    .object({
      message: optStr,
      errors: z
        .array(z.object({ message: optStr }))
        .optional()
        .catch(undefined),
    })
    .safeParse(json);
  const detail = env.success ? (env.data.errors?.[0]?.message ?? env.data.message) : undefined;
  return (detail ?? fallbackText).slice(0, 200);
}

/* ----------------------------------------------------------------------------------------- */
/* mfapi.in                                                                                  */
/* ----------------------------------------------------------------------------------------- */

export interface MfApiPayload {
  meta: { scheme_name?: string; fund_house?: string };
  data: Array<{ date: string; nav: string }>;
}

export function parseMfApi(json: unknown): MfApiPayload | null {
  const env = z
    .object({
      meta: z
        .object({ scheme_name: optStr, fund_house: optStr })
        .passthrough()
        .optional()
        .catch(undefined),
      data: z.array(
        z.object({ date: z.string(), nav: z.union([z.string(), z.number()]).transform(String) }),
      ),
    })
    .safeParse(json);
  if (!env.success) return null;
  return { meta: env.data.meta ?? {}, data: env.data.data };
}
