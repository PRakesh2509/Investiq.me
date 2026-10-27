import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getFallbackEtfHoldings } from "./etf-holdings-fallback";
import { fetchYahooChart, getInstrumentQuote } from "./market-data-provider.server.ts";
import {
  TtlCache,
  fetchJsonWithRetry,
  fetchWithRetry,
  isAllowedYahooInterval,
  isAllowedYahooRange,
  isValidSymbol,
  parseSymbolList,
  safeErrorMessage,
} from "./provider-utils.ts";
import {
  parseYahooNews,
  parseYahooSummary,
  parseYahooTimeseries,
  rawFmt,
  rawNum,
  type YahooNewsItem,
  type YahooSummary,
} from "./provider-parsers.ts";

const YAHOO_UA = { "User-Agent": "Mozilla/5.0 InvestIQ" } as const;

const SymbolSchema = z.string().min(1).max(32).refine(isValidSymbol, { message: "Invalid symbol" });

const summaryCache = new TtlCache<YahooSummary | null>(150);
const SUMMARY_TTL_MS = 10 * 60_000;
const timeseriesCache = new TtlCache<ReturnType<typeof parseYahooTimeseries>>(60);
const newsCache = new TtlCache<YahooNewsItem[]>(60);
const NEWS_TTL_MS = 2 * 60_000;

/** Cached quoteSummary fetch. Returns null when Yahoo has nothing (or is unreachable). */
async function fetchSummary(symbol: string, modules: string): Promise<YahooSummary | null> {
  const key = `${symbol}|${modules}`;
  const hit = summaryCache.get(key, SUMMARY_TTL_MS);
  if (hit !== undefined) return hit;
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol,
    )}?modules=${modules}`;
    const res = await fetchJsonWithRetry(
      url,
      { headers: YAHOO_UA },
      { timeoutMs: 6000, retries: 1 },
    );
    if (!res.ok) return null;
    const parsed = parseYahooSummary(res.json);
    summaryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

// Fetch chart from Yahoo Finance (no auth required).
// Symbols must include exchange suffix, e.g. RELIANCE.NS, TCS.NS, INFY.NS.
export const getYahooChart = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        symbol: SymbolSchema,
        interval: z.string().refine(isAllowedYahooInterval, "Unsupported interval").default("5m"),
        range: z.string().refine(isAllowedYahooRange, "Unsupported range").default("1d"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const r = await fetchYahooChart(data.symbol, data.interval, data.range);
    if (!r) return { ok: false as const, error: "no data" };
    const { meta, points: rawPoints } = r.chart;
    const points = rawPoints.map((p) => ({ t: p.time * 1000, price: p.close, volume: p.volume }));
    return {
      ok: true as const,
      currency: meta.currency ?? "INR",
      previousClose: meta.chartPreviousClose ?? points[0]?.price ?? 0,
      regularMarketPrice: meta.regularMarketPrice ?? points[points.length - 1]?.price ?? 0,
      dayHigh: meta.regularMarketDayHigh ?? 0,
      dayLow: meta.regularMarketDayLow ?? 0,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? 0,
      regularMarketVolume: meta.regularMarketVolume ?? 0,
      points,
      isStale: r.stale,
    };
  });

// Batch quote by fanning out to the (cached) v8 chart per symbol.
export const getYahooQuotes = createServerFn({ method: "POST" })
  .validator((data) => z.object({ symbols: z.string().min(1).max(4000) }).parse(data))
  .handler(async ({ data }) => {
    const symbols = parseSymbolList(data.symbols, 120);
    if (symbols.length === 0) return { ok: false as const, error: "no valid symbols" };

    const fetchOne = async (sym: string) => {
      const q = await getInstrumentQuote({ yahooSymbol: sym });
      if (!q) return null;
      return {
        symbol: sym,
        name: q.name ?? sym,
        price: q.price,
        change: q.change,
        changePct: q.changePct,
        volume: q.volume,
        marketCap: 0,
        pe: 0,
        high52: q.high52 ?? 0,
        low52: q.low52 ?? 0,
        freshnessStatus: q.freshnessStatus,
      };
    };
    try {
      const results: Awaited<ReturnType<typeof fetchOne>>[] = [];
      const CHUNK = 12;
      for (let i = 0; i < symbols.length; i += CHUNK) {
        const batch = symbols.slice(i, i + CHUNK);
        results.push(...(await Promise.all(batch.map(fetchOne))));
      }
      return {
        ok: true as const,
        quotes: results.filter((q): q is NonNullable<typeof q> => q !== null && q.price > 0),
      };
    } catch (e) {
      return { ok: false as const, error: safeErrorMessage(e) };
    }
  });

// Fundamentals via Yahoo quoteSummary — fetches statistics, financials, price.
export const getYahooFundamentals = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: SymbolSchema }).parse(data))
  .handler(async ({ data }) => {
    const modules = [
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "price",
      "assetProfile",
    ].join(",");
    const r = await fetchSummary(data.symbol, modules);
    if (!r) return { ok: false as const, error: "no data" };
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fd = r.financialData ?? {};
    const px = r.price ?? {};
    const ap = r.assetProfile ?? {};
    const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v ? v : fallback);
    return {
      ok: true as const,
      name: str(px.longName, str(px.shortName, data.symbol)),
      sector: str(ap.sector),
      industry: str(ap.industry),
      summary: str(ap.longBusinessSummary),
      marketCap: rawNum(px.marketCap),
      marketCapFmt: rawFmt(px.marketCap),
      peTTM: rawNum(sd.trailingPE) || rawNum(ks.trailingPE),
      pbRatio: rawNum(ks.priceToBook),
      debtToEquity: rawNum(fd.debtToEquity),
      roe: rawNum(fd.returnOnEquity) * 100, // decimal → %
      epsTTM: rawNum(ks.trailingEps) || rawNum(fd.epsTrailingTwelveMonths),
      dividendYield: rawNum(sd.dividendYield) * 100,
      bookValue: rawNum(ks.bookValue),
      priceToSales: rawNum(sd.priceToSalesTrailing12Months),
      profitMargin: rawNum(fd.profitMargins) * 100,
      revenueGrowth: rawNum(fd.revenueGrowth) * 100,
      earningsGrowth: rawNum(fd.earningsGrowth) * 100,
      fiftyTwoWeekHigh: rawNum(sd.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: rawNum(sd.fiftyTwoWeekLow),
      currency: str(px.currency, "INR"),
      recommendationKey: str(fd.recommendationKey),
      targetMean: rawNum(fd.targetMeanPrice),
    };
  });

// Quarterly + yearly income statement via fundamentals-timeseries (no crumb needed).
export const getYahooFinancials = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: SymbolSchema }).parse(data))
  .handler(async ({ data }) => {
    const types = [
      "quarterlyTotalRevenue",
      "quarterlyNetIncome",
      "annualTotalRevenue",
      "annualNetIncome",
    ].join(",");
    let byType = timeseriesCache.get(data.symbol, SUMMARY_TTL_MS);
    if (!byType) {
      const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
        data.symbol,
      )}?symbol=${encodeURIComponent(data.symbol)}&type=${types}&period1=1420070400&period2=1900000000`;
      try {
        const res = await fetchJsonWithRetry(
          url,
          { headers: YAHOO_UA },
          { timeoutMs: 6000, retries: 1 },
        );
        if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
        byType = parseYahooTimeseries(res.json);
        timeseriesCache.set(data.symbol, byType);
      } catch (e) {
        return { ok: false as const, error: safeErrorMessage(e) };
      }
    }
    const series = byType;
    const merge = (revKey: string, niKey: string) => {
      const revs = series[revKey] ?? [];
      const nis = series[niKey] ?? [];
      const map = new Map<string, { date: string; ts: number; revenue: number; profit: number }>();
      const val = (o: Record<string, unknown>): number => rawNum(o.reportedValue);
      for (const row of revs) {
        const d = typeof row.asOfDate === "string" ? row.asOfDate : "";
        if (!d) continue;
        map.set(d, { date: d, ts: new Date(d).getTime(), revenue: val(row), profit: 0 });
      }
      for (const row of nis) {
        const d = typeof row.asOfDate === "string" ? row.asOfDate : "";
        if (!d) continue;
        const cur = map.get(d) ?? { date: d, ts: new Date(d).getTime(), revenue: 0, profit: 0 };
        cur.profit = val(row);
        map.set(d, cur);
      }
      return Array.from(map.values())
        .filter((x) => x.revenue > 0 || x.profit !== 0)
        .sort((a, b) => a.ts - b.ts);
    };
    const quarterly = merge("quarterlyTotalRevenue", "quarterlyNetIncome");
    const yearly = merge("annualTotalRevenue", "annualNetIncome");
    return { ok: true as const, quarterly, yearly };
  });

function parseGoogleNewsRss(xml: string, count: number): YahooNewsItem[] {
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, count);
  return matches.map((m) => {
    const rawTitle = m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
    const link = m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
    const pubDate = m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
    const source = m[1].match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "Financial News";
    const title = rawTitle
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/\s*-\s*[^-\n]+$/, "")
      .trim();
    const published = pubDate ? new Date(pubDate).getTime() : Date.now();
    return {
      title: title || rawTitle,
      publisher: source,
      link,
      providerPublishTime: Number.isFinite(published) ? published : Date.now(),
      thumbnail: "",
    };
  });
}

// News: Yahoo Finance news search (with Google News RSS fallback).
export const getYahooNews = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        query: z.string().trim().min(1).max(80),
        count: z.number().int().min(1).max(20).default(10),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const cacheKey = `${data.query}|${data.count}`;
    const cached = newsCache.get(cacheKey, NEWS_TTL_MS);
    if (cached) return { ok: true as const, items: cached };

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      data.query,
    )}&quotesCount=0&newsCount=${data.count}`;
    try {
      const res = await fetchJsonWithRetry(
        url,
        { headers: YAHOO_UA },
        { timeoutMs: 3500, retries: 1 },
      );
      if (res.ok) {
        const items = parseYahooNews(res.json);
        if (items.length > 0) {
          newsCache.set(cacheKey, items);
          return { ok: true as const, items };
        }
      }
    } catch {
      // Fall through to Google News RSS fallback
    }

    // Google News RSS fallback for resilient stock news delivery
    try {
      const cleanQ = data.query.replace(/\.(NS|BO)$/i, "");
      const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        cleanQ + " stock when:2d",
      )}&hl=en-IN&gl=IN&ceid=IN:en`;
      const res = await fetchWithRetry(
        gUrl,
        {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        },
        { timeoutMs: 5000, retries: 1 },
      );
      if (res.ok) {
        const items = parseGoogleNewsRss(await res.text(), data.count);
        if (items.length > 0) {
          newsCache.set(cacheKey, items);
          return { ok: true as const, items };
        }
      }
    } catch (e) {
      return { ok: false as const, error: safeErrorMessage(e) };
    }

    return { ok: true as const, items: [] };
  });

// Sector allocation & top holdings via Yahoo Finance quoteSummary (ETFs / funds).
// Note: only ETFs & mutual funds carry a `holdings` module; indices and single
// stocks return empty. Callers should show a friendly message in that case.
export const getYahooHoldings = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: SymbolSchema }).parse(data))
  .handler(async ({ data }) => {
    const fallback = getFallbackEtfHoldings(data.symbol);
    try {
      const r = await fetchSummary(data.symbol, "topHoldings,fundProfile,assetProfile,price");
      if (!r) return fallback ?? { ok: false as const, error: "no data" };
      const th = r.topHoldings;
      const sectorWeightings: { name: string; pct: number }[] = [];
      for (const row of th?.sectorWeightings ?? []) {
        const key = Object.keys(row).find((k) => k !== "maxAge");
        if (key) sectorWeightings.push({ name: key, pct: rawNum(row[key]) * 100 });
      }
      const rawHoldings = (th?.holdings ?? []).slice(0, 25).map((h) => ({
        symbol: typeof h.symbol === "string" ? h.symbol : "",
        name: typeof h.holdingName === "string" ? h.holdingName : "",
        pct: rawNum(h.holdingPercent) * 100,
      }));
      // Yahoo doesn't include per-holding sector in topHoldings, so fetch each holding's
      // assetProfile (cached, small batches) to stay polite to the upstream.
      const holdings: { symbol: string; name: string; pct: number; sector: string }[] = [];
      const CHUNK = 8;
      for (let i = 0; i < rawHoldings.length; i += CHUNK) {
        const batch = rawHoldings.slice(i, i + CHUNK);
        holdings.push(
          ...(await Promise.all(
            batch.map(async (h) => {
              if (!h.symbol || !isValidSymbol(h.symbol)) return { ...h, sector: "" };
              const s = await fetchSummary(h.symbol, "assetProfile");
              const sec = s?.assetProfile?.sector;
              return { ...h, sector: typeof sec === "string" ? sec : "" };
            }),
          )),
        );
      }
      const price = r.price ?? {};
      if (sectorWeightings.length === 0 && holdings.length === 0 && fallback) return fallback;
      const name =
        typeof price.longName === "string"
          ? price.longName
          : typeof price.shortName === "string"
            ? price.shortName
            : data.symbol;
      return {
        ok: true as const,
        name,
        sectorWeightings,
        holdings,
      };
    } catch (e) {
      return fallback ?? { ok: false as const, error: safeErrorMessage(e) };
    }
  });
