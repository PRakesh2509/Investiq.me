import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getYahooChart,
  getYahooFundamentals,
  getYahooFinancials,
  getYahooNews,
  getYahooHoldings,
} from "@/lib/yahoo.functions";
import { getLiveStockChart } from "@/lib/indian-stocks.functions";
import type { INTERVALS, Point } from "./constants";
import type { Financials, Fundamentals, Holdings, News } from "./types";

type IntervalOption = (typeof INTERVALS)[number];

const failed = (e: unknown) =>
  ({ ok: false, error: e instanceof Error ? e.message : "Request failed" }) as const;

/**
 * Price series (live feed with Yahoo fallback) plus fundamentals, financials, news and
 * ETF holdings for a symbol. Only real server data is returned; on failure `error` is set
 * and `data` stays empty (no synthetic series).
 */
export function useStockCharts(symbol: string, interval: IntervalOption, live: boolean) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedSource, setFeedSource] = useState<string>("DhanHQ / NSE Live");
  const [isSimulated, setIsSimulated] = useState(false);
  const [fund, setFund] = useState<Fundamentals | null>(null);
  const [fin, setFin] = useState<Financials | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);

  const fetchYahoo = useServerFn(getYahooChart);
  const fetchLiveChart = useServerFn(getLiveStockChart);
  const fetchFund = useServerFn(getYahooFundamentals);
  const fetchFin = useServerFn(getYahooFinancials);
  const fetchNews = useServerFn(getYahooNews);
  const fetchHoldings = useServerFn(getYahooHoldings);

  // Ignore responses that belong to a previous symbol/range selection.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await fetchLiveChart({
        data: { symbol, range: interval.range, interval: interval.interval },
      });
      if (id !== requestId.current) return;
      if (res.ok && res.points.length) {
        setData(res.points);
        setFeedSource(res.feedSource);
        setIsSimulated(Boolean(res.isSimulated));
        setError(null);
        return;
      }
      const fallbackRes = await fetchYahoo({
        data: { symbol: `${symbol}.NS`, interval: interval.interval, range: interval.range },
      });
      if (id !== requestId.current) return;
      if (fallbackRes.ok && fallbackRes.points.length) {
        const intraday = interval.range === "1d" || interval.range === "5d";
        setData(
          fallbackRes.points.map((p) => ({
            t: new Date(p.t).toLocaleString("en-IN", {
              ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
              day: "2-digit",
              month: "short",
              ...(interval.range === "5y" || interval.range === "max" ? { year: "numeric" } : {}),
            }),
            price: p.price,
            volume: p.volume ?? 0,
          })),
        );
        setFeedSource("NSE Live Feed");
        setIsSimulated(false);
        setError(null);
      } else {
        setError(`Live price data for ${symbol} is unavailable right now.`);
      }
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error && e.message ? e.message : `Could not load ${symbol}.`);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [symbol, interval, fetchLiveChart, fetchYahoo]);

  // New symbol: drop everything from the previous one before loading.
  useEffect(() => {
    setData([]);
    setError(null);
    setFund(null);
    setFin(null);
    setNews(null);
    setHoldings(null);
  }, [symbol]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [live, load]);

  // Fundamentals + news + holdings (for ETFs) whenever the symbol changes.
  useEffect(() => {
    let cancelled = false;
    const sym = `${symbol}.NS`;
    (async () => {
      const [f, fi, n, h] = await Promise.allSettled([
        fetchFund({ data: { symbol: sym } }),
        fetchFin({ data: { symbol: sym } }),
        fetchNews({ data: { query: sym, count: 12 } }),
        fetchHoldings({ data: { symbol: sym } }),
      ]);
      if (cancelled) return;
      setFund(f.status === "fulfilled" ? f.value : (failed(f.reason) as unknown as Fundamentals));
      setFin(fi.status === "fulfilled" ? fi.value : (failed(fi.reason) as unknown as Financials));
      setNews(n.status === "fulfilled" ? n.value : (failed(n.reason) as unknown as News));
      setHoldings(h.status === "fulfilled" ? h.value : (failed(h.reason) as unknown as Holdings));
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, fetchFund, fetchFin, fetchNews, fetchHoldings]);

  return {
    data,
    loading,
    error,
    feedSource,
    setFeedSource,
    isSimulated,
    fund,
    fin,
    news,
    holdings,
    reload: load,
  };
}
