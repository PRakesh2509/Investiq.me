import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getFallbackEtfHoldings } from "./etf-holdings-fallback";

// Fetch chart from Yahoo Finance (no auth required).
// Symbols must include exchange suffix, e.g. RELIANCE.NS, TCS.NS, INFY.NS.
export const getYahooChart = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        symbol: z.string().min(1),
        interval: z.string().default("5m"),
        range: z.string().default("1d"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      data.symbol,
    )}?interval=${data.interval}&range=${data.range}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
      });
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      const json = (await res.json()) as any;
      const r = json?.chart?.result?.[0];
      if (!r) return { ok: false as const, error: "no data" };
      const ts: number[] = r.timestamp ?? [];
      const q = r.indicators?.quote?.[0] ?? {};
      const closes: (number | null)[] = q.close ?? [];
      const volumes: (number | null)[] = q.volume ?? [];
      const points = ts
        .map((t, i) => ({
          t: t * 1000,
          price: closes[i],
          volume: typeof volumes[i] === "number" ? (volumes[i] as number) : 0,
        }))
        .filter((p): p is { t: number; price: number; volume: number } => typeof p.price === "number");
      const meta = r.meta ?? {};
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
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

// Batch quote by fanning out to v8 chart per symbol.
export const getYahooQuotes = createServerFn({ method: "POST" })
  .validator((data) => z.object({ symbols: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const symbols = data.symbols.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 120);
    const fetchOne = async (sym: string) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          sym,
        )}?interval=1d&range=5d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
        if (!res.ok) return null;
        const json = (await res.json()) as any;
        const r = json?.chart?.result?.[0];
        if (!r) return null;
        const meta = r.meta ?? {};
        const price = Number(meta.regularMarketPrice ?? 0);
        const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
        const change = price - prev;
        const changePct = prev ? (change / prev) * 100 : 0;
        return {
          symbol: sym,
          name: meta.longName ?? meta.shortName ?? sym,
          price,
          change,
          changePct,
          volume: Number(meta.regularMarketVolume ?? 0),
          marketCap: 0,
          pe: 0,
          high52: Number(meta.fiftyTwoWeekHigh ?? 0),
          low52: Number(meta.fiftyTwoWeekLow ?? 0),
        };
      } catch {
        return null;
      }
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
      return { ok: false as const, error: (e as Error).message };
    }
  });


// Fundamentals via Yahoo quoteSummary — fetches statistics, financials, price.
export const getYahooFundamentals = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const modules = [
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "price",
      "assetProfile",
    ].join(",");
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      data.symbol,
    )}?modules=${modules}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      const json = (await res.json()) as any;
      const r = json?.quoteSummary?.result?.[0];
      if (!r) return { ok: false as const, error: "no data" };
      const sd = r.summaryDetail ?? {};
      const ks = r.defaultKeyStatistics ?? {};
      const fd = r.financialData ?? {};
      const px = r.price ?? {};
      const ap = r.assetProfile ?? {};
      const val = (o: any): number => (typeof o === "object" && o !== null ? Number(o.raw ?? 0) : Number(o ?? 0));
      const fmt = (o: any): string => (typeof o === "object" && o !== null ? String(o.fmt ?? "") : String(o ?? ""));
      return {
        ok: true as const,
        name: px.longName ?? px.shortName ?? data.symbol,
        sector: ap.sector ?? "",
        industry: ap.industry ?? "",
        summary: ap.longBusinessSummary ?? "",
        marketCap: val(px.marketCap),
        marketCapFmt: fmt(px.marketCap),
        peTTM: val(sd.trailingPE) || val(ks.trailingPE),
        pbRatio: val(ks.priceToBook),
        debtToEquity: val(fd.debtToEquity),
        roe: val(fd.returnOnEquity) * 100, // decimal → %
        epsTTM: val(ks.trailingEps) || val(fd.epsTrailingTwelveMonths),
        dividendYield: val(sd.dividendYield) * 100,
        bookValue: val(ks.bookValue),
        priceToSales: val(sd.priceToSalesTrailing12Months),
        profitMargin: val(fd.profitMargins) * 100,
        revenueGrowth: val(fd.revenueGrowth) * 100,
        earningsGrowth: val(fd.earningsGrowth) * 100,
        fiftyTwoWeekHigh: val(sd.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: val(sd.fiftyTwoWeekLow),
        currency: px.currency ?? "INR",
        recommendationKey: fd.recommendationKey ?? "",
        targetMean: val(fd.targetMeanPrice),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

// Quarterly + yearly income statement via fundamentals-timeseries (no crumb needed).
export const getYahooFinancials = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const types = [
      "quarterlyTotalRevenue",
      "quarterlyNetIncome",
      "annualTotalRevenue",
      "annualNetIncome",
    ].join(",");
    const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
      data.symbol,
    )}?symbol=${encodeURIComponent(data.symbol)}&type=${types}&period1=1420070400&period2=1900000000`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      const json = (await res.json()) as any;
      const results: any[] = json?.timeseries?.result ?? [];
      const byType: Record<string, any[]> = {};
      for (const r of results) {
        const t = r?.meta?.type?.[0];
        if (!t) continue;
        byType[t] = (r[t] ?? []).filter(Boolean);
      }
      const merge = (revKey: string, niKey: string) => {
        const revs = byType[revKey] ?? [];
        const nis = byType[niKey] ?? [];
        const map = new Map<string, { date: string; ts: number; revenue: number; profit: number }>();
        const val = (o: any): number =>
          typeof o?.reportedValue === "object" ? Number(o.reportedValue.raw ?? 0) : 0;
        for (const row of revs) {
          const d = row?.asOfDate as string;
          if (!d) continue;
          map.set(d, { date: d, ts: new Date(d).getTime(), revenue: val(row), profit: 0 });
        }
        for (const row of nis) {
          const d = row?.asOfDate as string;
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
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });


// News: Yahoo Finance news search (with Google News RSS fallback).
export const getYahooNews = createServerFn({ method: "GET" })
  .validator((data) =>
    z.object({ query: z.string().min(1), count: z.number().min(1).max(20).default(10) }).parse(data),
  )
  .handler(async ({ data }) => {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      data.query,
    )}&quotesCount=0&newsCount=${data.count}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 InvestIQ" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json = (await res.json()) as any;
        const items = (json?.news ?? []).map((n: any) => ({
          title: String(n.title ?? ""),
          publisher: String(n.publisher ?? ""),
          link: String(n.link ?? ""),
          providerPublishTime: Number(n.providerPublishTime ?? 0) * 1000,
          thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? "",
        }));
        if (items.length > 0) {
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
      const res = await fetch(gUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (res.ok) {
        const xml = await res.text();
        const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, data.count);
        const items = matches.map((m) => {
          const rawTitle = m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
          const link = m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
          const pubDate = m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
          const source = m[1].match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "Financial News";
          const title = rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\s*-\s*[^-\n]+$/, "").trim();
          return {
            title: title || rawTitle,
            publisher: source,
            link,
            providerPublishTime: pubDate ? new Date(pubDate).getTime() : Date.now(),
            thumbnail: "",
          };
        });
        if (items.length > 0) {
          return { ok: true as const, items };
        }
      }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }

    return { ok: true as const, items: [] };
  });

// Sector allocation & top holdings via Yahoo Finance quoteSummary (ETFs / funds).
// Note: only ETFs & mutual funds carry a `holdings` module; indices and single
// stocks return empty. Callers should show a friendly message in that case.
export const getYahooHoldings = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const fallback = getFallbackEtfHoldings(data.symbol);
    const modules = "topHoldings,fundProfile,assetProfile,price";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      data.symbol,
    )}?modules=${modules}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
      if (!res.ok) return fallback ?? { ok: false as const, error: `HTTP ${res.status}` };
      const json = (await res.json()) as any;
      const r = json?.quoteSummary?.result?.[0];
      if (!r) return fallback ?? { ok: false as const, error: "no data" };
      const val = (o: any): number =>
        typeof o === "object" && o !== null ? Number(o.raw ?? 0) : Number(o ?? 0);
      const th = r.topHoldings ?? {};
      const sectorWeightings: { name: string; pct: number }[] = (th.sectorWeightings ?? [])
        .map((row: any) => {
          const key = Object.keys(row).find((k) => k !== "maxAge");
          if (!key) return null;
          return { name: key, pct: val(row[key]) * 100 };
        })
        .filter(Boolean);
      const rawHoldings: { symbol: string; name: string; pct: number }[] = (th.holdings ?? []).map(
        (h: any) => ({
          symbol: String(h.symbol ?? ""),
          name: String(h.holdingName ?? ""),
          pct: val(h.holdingPercent) * 100,
        }),
      );
      // Fan out to fetch each holding's sector (assetProfile) — Yahoo doesn't
      // include per-holding sector in topHoldings. Cap concurrency to be nice.
      const holdings = await Promise.all(
        rawHoldings.map(async (h) => {
          if (!h.symbol) return { ...h, sector: "" };
          try {
            const u = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
              h.symbol,
            )}?modules=assetProfile`;
            const rr = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 InvestIQ" } });
            if (!rr.ok) return { ...h, sector: "" };
            const jj = (await rr.json()) as any;
            const sec = jj?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? "";
            return { ...h, sector: String(sec) };
          } catch {
            return { ...h, sector: "" };
          }
        }),
      );
      const price = r.price ?? {};
      if (sectorWeightings.length === 0 && holdings.length === 0 && fallback) return fallback;
      return {
        ok: true as const,
        name: price.longName ?? price.shortName ?? data.symbol,
        sectorWeightings,
        holdings,
      };

    } catch (e) {
      return fallback ?? { ok: false as const, error: (e as Error).message };
    }
  });
