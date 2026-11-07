import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDhanFundamentals,
  getDhanFinancials,
  getDhanNews,
  getDhanHoldings,
} from "@/lib/dhan.functions";
import { getLiveStockChart, type StockChartMeta } from "@/lib/indian-stocks.functions";
import type { INTERVALS, Point } from "./constants";
import type { Financials, Fundamentals, Holdings, News } from "./types";

type IntervalOption = (typeof INTERVALS)[number];

const failed = (e: unknown) =>
  ({ ok: false, error: e instanceof Error ? e.message : "Request failed" }) as const;

/**
 * Price series (100% Dhan-backed) plus fundamentals, financials, news and
 * holdings for a symbol. Only real server data is returned; on failure `error` is set
 * and `data` stays empty (no synthetic series).
 */
export function useStockCharts(symbol: string, interval: IntervalOption, live: boolean) {
  const [data, setData] = useState<Point[]>([]);
  const [stockMeta, setStockMeta] = useState<StockChartMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedSource, setFeedSource] = useState<string>("DhanHQ Live Direct Feed");
  const [isSimulated, setIsSimulated] = useState(false);
  const [fund, setFund] = useState<Fundamentals | null>(null);
  const [fin, setFin] = useState<Financials | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);

  const fetchLiveChart = useServerFn(getLiveStockChart);
  const fetchFund = useServerFn(getDhanFundamentals);
  const fetchFin = useServerFn(getDhanFinancials);
  const fetchNews = useServerFn(getDhanNews);
  const fetchHoldings = useServerFn(getDhanHoldings);

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
        if (res.meta) setStockMeta(res.meta);
        setFeedSource(res.feedSource || "DhanHQ Live Direct Feed");
        setIsSimulated(Boolean(res.isSimulated));
        setError(null);
        return;
      }
      setError(`Live price data for ${symbol} is unavailable from DhanHQ.`);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error && e.message ? e.message : `Could not load ${symbol}.`);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [symbol, interval, fetchLiveChart]);

  // New symbol: drop everything from the previous one before loading.
  useEffect(() => {
    setData([]);
    setStockMeta(null);
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

  // Fundamentals + news + holdings whenever the symbol changes.
  useEffect(() => {
    let cancelled = false;
    const cleanSym = symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").replace(/^\^/, "");
    (async () => {
      const [f, fi, n, h] = await Promise.allSettled([
        fetchFund({ data: { symbol: cleanSym } }),
        fetchFin({ data: { symbol: cleanSym } }),
        fetchNews({ data: { query: cleanSym, count: 12 } }),
        fetchHoldings({ data: { symbol: cleanSym } }),
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
    stockMeta,
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
