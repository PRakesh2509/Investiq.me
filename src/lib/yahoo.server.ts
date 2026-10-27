/**
 * Shared Yahoo Finance v8 chart helpers for alert hooks and the Telegram bot.
 *
 * Yahoo's v7 /finance/quote requires a crumb, so quotes are derived from the
 * auth-free v8 chart endpoint. Every call has a timeout and is null-safe: a failing
 * symbol returns null instead of throwing.
 *
 * No Nitro imports so the pure parsers can be unit-tested with node --test.
 */

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
export const YAHOO_USER_AGENT = "Mozilla/5.0 InvestIQ";
const DEFAULT_TIMEOUT_MS = 8_000;

export interface YahooChartResult {
  meta?: Record<string, unknown>;
  timestamp?: (number | null)[];
  indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
}

export interface YahooQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Yahoo symbol for an NSE ticker ("TCS" -> "TCS.NS"); indices (^NSEI) and suffixed symbols pass through. */
export function toYahooSymbol(symbol: string): string {
  const s = symbol.trim();
  return s.startsWith("^") || s.includes(".") ? s : `${s}.NS`;
}

/** Fetch the first chart result, or null on any failure. One retry on 429 / 5xx / timeout. */
export async function fetchChart(
  symbol: string,
  range = "6mo",
  interval = "1d",
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<YahooChartResult | null> {
  const url = `${CHART_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": YAHOO_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        return null;
      }
      if (!res.ok) return null;
      const json = (await res.json()) as { chart?: { result?: YahooChartResult[] | null } };
      return json?.chart?.result?.[0] ?? null;
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

/**
 * Previous-session close. Order: meta.previousClose, then the second-to-last daily bar
 * (or the last bar when today's bar is not there yet), then meta.chartPreviousClose.
 * Note chartPreviousClose alone is the close BEFORE the requested range (a 5d-old value
 * for range=5d), so it is only a last resort.
 */
export function derivePrevClose(result: YahooChartResult): number {
  const meta = result.meta ?? {};
  const metaPrev = num(meta.previousClose);
  if (metaPrev > 0) return metaPrev;

  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const bars: { t: number; c: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const c = closes[i];
    if (typeof t === "number" && typeof c === "number" && Number.isFinite(c) && c > 0) {
      bars.push({ t, c });
    }
  }
  if (bars.length) {
    const offset = num(meta.gmtoffset);
    const dayOf = (t: number) => Math.floor((t + offset) / 86_400);
    const last = bars[bars.length - 1];
    const refTime = num(meta.regularMarketTime) || last.t;
    if (dayOf(last.t) >= dayOf(refTime)) {
      if (bars.length >= 2) return bars[bars.length - 2].c;
    } else {
      return last.c;
    }
  }
  return num(meta.chartPreviousClose);
}

/** Build a quote from a chart result; null when there is no usable price/previous close. */
export function quoteFromChart(symbol: string, result: YahooChartResult | null): YahooQuote | null {
  if (!result) return null;
  const meta = result.meta ?? {};
  const price = num(meta.regularMarketPrice);
  if (!price) return null;
  const prev = derivePrevClose(result) || price;
  const change = price - prev;
  return {
    symbol: typeof meta.symbol === "string" ? meta.symbol : symbol,
    name:
      (typeof meta.longName === "string" && meta.longName) ||
      (typeof meta.shortName === "string" && meta.shortName) ||
      symbol,
    price,
    prevClose: prev,
    change,
    changePct: prev ? (change / prev) * 100 : 0,
    volume: num(meta.regularMarketVolume),
    fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow),
  };
}

/** Latest quote for a full Yahoo symbol (e.g. "TCS.NS", "^NSEI"), or null. */
export async function fetchQuote(symbol: string): Promise<YahooQuote | null> {
  return quoteFromChart(symbol, await fetchChart(symbol, "5d", "1d"));
}

/** Non-null daily closes, oldest first. Empty array on failure. */
export async function fetchDailyCloses(symbol: string, range = "6mo"): Promise<number[]> {
  const r = await fetchChart(symbol, range, "1d");
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/** Quotes for many symbols in small parallel batches; result order matches input, null for failures. */
export async function fetchQuotes(
  symbols: string[],
  batchSize = 12,
): Promise<(YahooQuote | null)[]> {
  const out: (YahooQuote | null)[] = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((s) => fetchQuote(s)));
    for (const r of settled) out.push(r.status === "fulfilled" ? r.value : null);
  }
  return out;
}
