import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STOCKS, formatINR } from "@/lib/market-data";
import { DESKTOP_SYMBOLS, chartData, computeRSI } from "@/lib/desktop-data";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";
import { PremiumLoader } from "@/components/PremiumLoader";
import {
  getYahooChart,
  getYahooFundamentals,
  getYahooFinancials,
  getYahooNews,
  getYahooHoldings,
} from "@/lib/yahoo.functions";
import { getLiveStockChart, getIndianStockQuotes, LiveStockQuote } from "@/lib/indian-stocks.functions";
import { pushRecentViewed } from "@/lib/recent-viewed";
import { RefreshCw, ExternalLink, Zap, Search, ChevronDown, Check, Sparkles } from "lucide-react";
import { DhanConnectModal } from "@/components/DhanConnectModal";

export interface DesktopChartsSearch {
  symbol?: string;
  tab?: "overview" | "financials" | "news";
}

export const Route = createFileRoute("/desktop/charts")({
  validateSearch: (s: Record<string, unknown>): DesktopChartsSearch => ({
    symbol: typeof s.symbol === "string" ? s.symbol.toUpperCase() : undefined,
    tab: typeof s.tab === "string" ? (s.tab as "overview" | "financials" | "news") : undefined,
  }),
  component: DesktopCharts,
});

const INTERVALS: Array<{ id: string; label: string; interval: string; range: string }> = [
  { id: "1d", label: "1D", interval: "5m", range: "1d" },
  { id: "1w", label: "1W", interval: "30m", range: "5d" },
  { id: "1mo", label: "1M", interval: "1d", range: "1mo" },
  { id: "3mo", label: "3M", interval: "1d", range: "3mo" },
  { id: "6mo", label: "6M", interval: "1d", range: "6mo" },
  { id: "1y", label: "1Y", interval: "1wk", range: "1y" },
  { id: "5y", label: "5Y", interval: "1mo", range: "5y" },
  { id: "all", label: "ALL", interval: "1mo", range: "max" },
];

type Point = { t: string; price: number; volume: number };
type Fundamentals = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooFundamentals>>>>;
type Financials = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooFinancials>>>>;
type News = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooNews>>>>;
type Holdings = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooHoldings>>>>;

type Tab = "overview" | "financials" | "news";

const SECTOR_PALETTE = [
  "#E7A92A", "#9B8EC4", "#4B7BED", "#2DBF7F", "#FFD700",
  "#FF6B6B", "#38BDF8", "#A78BFA", "#F472B6", "#34D399", "#FB7185",
];
const titleize = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const SECTOR_CATEGORIES: Record<string, string[]> = {
  "Top 10": ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "LTIM", "TATAMOTORS"],
  "Banking & Fin": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "BAJFINANCE", "BAJAJFINSV", "PNB", "BANKBARODA"],
  "IT Services": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "LTIM", "PERSISTENT", "MPHASIS"],
  "Auto": ["TATAMOTORS", "MARUTI", "M&M", "BAJAJ-AUTO", "EICHERMOT", "TVSMOTOR", "HEROMOTOCO"],
  "Energy": ["RELIANCE", "ONGC", "IOC", "BPCL", "HINDPETRO", "GAIL", "NTPC", "POWERGRID", "TATAPOWER"],
  "Pharma": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "TORNTPHARM", "LUPIN", "APOLLOHOSP"],
  "FMCG": ["ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "GODREJCP", "DABUR", "VBL", "TATACONSUM"],
  "Metals": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "COALINDIA", "VEDL"],
};

function DesktopCharts() {
  const search = Route.useSearch();
  const [symbol, setSymbol] = useState(search.symbol || "RELIANCE");
  const [interval, setInterval] = useState(INTERVALS[1]);
  const [tab, setTab] = useState<Tab>(search.tab || "overview");
  useEffect(() => {
    if (search.symbol) setSymbol(search.symbol);
    if (search.tab) setTab(search.tab as Tab);
  }, [search.symbol, search.tab]);
  useEffect(() => { if (symbol) pushRecentViewed(symbol); }, [symbol]);

  const [dhanModalOpen, setDhanModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Top 10");
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [quickQuotes, setQuickQuotes] = useState<Record<string, { price: number; changePct: number }>>({});

  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [source, setSource] = useState<"dhan" | "yahoo" | "mock">("dhan");
  const [feedSource, setFeedSource] = useState<string>("DhanHQ / NSE Live");
  const [fund, setFund] = useState<Fundamentals | null>(null);
  const [fin, setFin] = useState<Financials | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const fetchYahoo = useServerFn(getYahooChart);
  const fetchLiveChart = useServerFn(getLiveStockChart);
  const fetchIndianQuotes = useServerFn(getIndianStockQuotes);
  const fetchFund = useServerFn(getYahooFundamentals);
  const fetchFin = useServerFn(getYahooFinancials);
  const fetchNews = useServerFn(getYahooNews);
  const fetchHoldings = useServerFn(getYahooHoldings);

  // Quick live quotes for the active category pills
  useEffect(() => {
    let cancelled = false;
    const symbols = SECTOR_CATEGORIES[activeCategory] || [];
    if (!symbols.length) return;
    (async () => {
      try {
        const res = await fetchIndianQuotes({ data: { symbols: symbols.join(",") } });
        if (cancelled || !res.ok) return;
        const qMap: Record<string, { price: number; changePct: number }> = {};
        for (const q of res.quotes) {
          qMap[q.symbol] = { price: q.price, changePct: q.changePct };
        }
        setQuickQuotes((prev) => ({ ...prev, ...qMap }));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, fetchIndianQuotes]);

  const niftyMatch = NIFTY_UNIVERSE.find((s) => s.symbol === symbol);
  const meta = STOCKS[symbol] ?? {
    symbol,
    name: niftyMatch?.name ?? symbol,
    sector: niftyMatch?.sector ?? "—",
    isin: "—",
    basePrice: 0,
    dayChangePct: 0,
    marketCap: "—",
    pe: 0,
    eps: 0,
    divYield: 0,
    high52: 0,
    low52: 0,
    volume: "—",
    about: "",
  };

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const res = await fetchLiveChart({
          data: { symbol, range: interval.range, interval: interval.interval },
        });
        if (res.ok && res.points.length) {
          setData(res.points);
          setFeedSource(res.feedSource);
          setSource(res.feedSource.includes("Dhan") ? "dhan" : "yahoo");
        } else {
          const fallbackRes = await fetchYahoo({
            data: { symbol: `${symbol}.NS`, interval: interval.interval, range: interval.range },
          });
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
            setSource("yahoo");
          } else {
            setData(chartData(symbol, 60).map((d) => ({ ...d, volume: 0 })));
            setSource("mock");
          }
        }
      } catch {
        setData(chartData(symbol, 60).map((d) => ({ ...d, volume: 0 })));
        setSource("mock");
      } finally {
        setLoading(false);
      }
    },
    [symbol, interval, fetchLiveChart, fetchYahoo],
  );

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => load(), 10_000);
    return () => window.clearInterval(id);
  }, [live, load]);

  // Fetch fundamentals + news + holdings (for ETFs) whenever symbol changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setData([]);
      setFund(null);
      setFin(null);
      setNews(null);
      setHoldings(null);
      const [f, fi, n, h] = await Promise.all([
        fetchFund({ data: { symbol: `${symbol}.NS` } }),
        fetchFin({ data: { symbol: `${symbol}.NS` } }),
        fetchNews({ data: { query: `${symbol}.NS`, count: 12 } }),
        fetchHoldings({ data: { symbol: `${symbol}.NS` } }),
      ]);
      if (cancelled) return;
      setFund(f);
      setFin(fi);
      setNews(n);
      setHoldings(h);
    })();
    return () => { cancelled = true; };
  }, [symbol, fetchFund, fetchFin, fetchNews, fetchHoldings]);

  const rsi = useMemo(() => computeRSI(data.map((d) => d.price)), [data]);
  const volData = useMemo(() => data.map((d) => ({ t: d.t, v: d.volume })), [data]);
  const hasVolume = useMemo(() => volData.some((d) => d.v > 0), [volData]);
  const formatVol = (v: number) =>
    v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v);
  const formatCr = (v: number) =>
    v >= 1e12 ? `₹${(v / 1e12).toFixed(2)}L Cr` : v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${v.toFixed(0)}`;

  const last = data[data.length - 1]?.price ?? 0;
  const first = data[0]?.price ?? 0;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const positive = changePct >= 0;

  // Live fundamentals (Yahoo) with fallback to static meta.
  const fLive = fund && fund.ok ? fund : null;
  const marketCapDisplay = fLive?.marketCapFmt || (fLive?.marketCap ? formatCr(fLive.marketCap) : meta.marketCap);
  const peDisplay = fLive?.peTTM ? fLive.peTTM.toFixed(2) : meta.pe ? meta.pe.toFixed(2) : "—";
  const pbDisplay = fLive?.pbRatio ? fLive.pbRatio.toFixed(2) : "—";
  const deDisplay = fLive?.debtToEquity ? (fLive.debtToEquity / 100).toFixed(2) : "—";
  const roeDisplay = fLive?.roe ? `${fLive.roe.toFixed(2)}%` : "—";
  const epsDisplay = fLive?.epsTTM ? fLive.epsTTM.toFixed(2) : meta.eps ? meta.eps.toFixed(2) : "—";
  const dyDisplay = fLive?.dividendYield ? `${fLive.dividendYield.toFixed(2)}%` : meta.divYield ? `${meta.divYield.toFixed(2)}%` : "—";
  const bvDisplay = fLive?.bookValue ? fLive.bookValue.toFixed(2) : "—";

  // AI Recommendation — combines RSI + momentum + fundamentals + Yahoo analyst view.
  const aiRec = useMemo(() => {
    let score = 0;
    const reasons: string[] = [];
    if (rsi < 30) { score += 2; reasons.push("RSI oversold"); }
    else if (rsi > 70) { score -= 2; reasons.push("RSI overbought"); }
    if (changePct > 2) { score += 1; reasons.push("Positive momentum"); }
    else if (changePct < -2) { score -= 1; reasons.push("Negative momentum"); }
    const pe = fLive?.peTTM ?? meta.pe;
    if (pe > 0 && pe < 25) { score += 1; reasons.push("Reasonable P/E"); }
    else if (pe > 60) { score -= 1; reasons.push("Rich P/E"); }
    const dy = fLive?.dividendYield ?? meta.divYield;
    if (dy && dy > 1.5) { score += 1; reasons.push("Dividend support"); }
    if (fLive?.roe && fLive.roe > 15) { score += 1; reasons.push("Strong ROE"); }
    if (fLive?.recommendationKey === "buy" || fLive?.recommendationKey === "strong_buy") {
      score += 1; reasons.push("Analyst BUY");
    } else if (fLive?.recommendationKey === "sell") {
      score -= 1; reasons.push("Analyst SELL");
    }
    const label = score >= 2 ? "BUY" : score <= -2 ? "SELL" : "HOLD";
    const color = label === "BUY" ? "success" : label === "SELL" ? "destructive" : "primary";
    return { label, color, reasons };
  }, [rsi, changePct, fLive, meta.pe, meta.divYield]);

  // Market status (IST 9:15-15:30 Mon-Fri) with live countdown.
  const marketStatus = useMarketStatus();

  // Technical levels derived from price series + analyst target when available.
  const levels = useMemo(() => {
    if (!data.length) return null;
    const prices = data.map((d) => d.price);
    const window = prices.slice(-20);
    const support = Math.min(...window);
    const resistance = Math.max(...window);
    const analystTarget = fLive?.targetMean && fLive.targetMean > 0 ? fLive.targetMean : 0;
    const target = analystTarget || last * 1.06;
    return {
      target,
      support,
      resistance,
      upside: last ? ((target - last) / last) * 100 : 0,
      downside: last ? ((support - last) / last) * 100 : 0,
      overhead: last ? ((resistance - last) / last) * 100 : 0,
      entryLow: support,
      entryHigh: support + (last - support) * 0.5,
      exitLow: resistance + (target - resistance) * 0.3,
      exitHigh: target,
      stopLoss: support * 0.985,
      analyst: !!analystTarget,
    };
  }, [data, last, fLive]);

  // AI sentiment pie — derived from aiRec label.
  const sentiment = useMemo(() => {
    if (aiRec.label === "BUY") return { buy: 65, hold: 25, sell: 10 };
    if (aiRec.label === "SELL") return { buy: 15, hold: 25, sell: 60 };
    return { buy: 35, hold: 45, sell: 20 };
  }, [aiRec.label]);

  // Volatility → risk level.
  const risk = useMemo(() => {
    if (!data.length) return { label: "Medium", color: "text-warning" };
    const prices = data.map((d) => d.price);
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
    const vol = Math.sqrt(variance) * 100;
    if (vol < 1) return { label: "Low", color: "text-success" };
    if (vol < 2.2) return { label: "Medium", color: "text-warning" };
    return { label: "High", color: "text-destructive" };
  }, [data]);

  if (loading && data.length === 0) {
    return (
      <div className="py-16">
        <PremiumLoader label={`Loading ${symbol} · Dhan / Live Market Feed`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Stocks</h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <button
              onClick={() => setDhanModalOpen(true)}
              title="Click to connect or manage DhanHQ API feed"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
            >
              <Zap className="h-3 w-3" />
              <span>{feedSource || "DhanHQ Live Feed"}</span>
            </button>
            <span>Real-time price feed, historical performance &amp; latest news · auto-refresh every 10s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-primary" />
            Auto-refresh
          </label>
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Interactive Indian Stocks Selector & Live Search */}
      <div className="rounded-2xl border border-border bg-surface/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sector category buttons */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
            {Object.keys(SECTOR_CATEGORIES).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "border border-border/70 bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Quick search input */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={stockSearchQuery}
              onChange={(e) => {
                setStockSearchQuery(e.target.value);
                setShowStockDropdown(true);
              }}
              onFocus={() => setShowStockDropdown(true)}
              onBlur={() => setTimeout(() => setShowStockDropdown(false), 200)}
              placeholder="Search Indian stocks (e.g. RELIANCE, TCS)..."
              className="h-8 w-full rounded-lg border border-border bg-background/50 pl-8 pr-3 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
            />
            {showStockDropdown && stockSearchQuery.trim() && (
              <div className="absolute left-0 right-0 top-10 z-40 max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-2xl">
                {NIFTY_UNIVERSE.filter(
                  (s) =>
                    s.symbol.includes(stockSearchQuery.trim().toUpperCase()) ||
                    s.name.toUpperCase().includes(stockSearchQuery.trim().toUpperCase()),
                )
                  .slice(0, 8)
                  .map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSymbol(s.symbol);
                        setStockSearchQuery("");
                        setShowStockDropdown(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{s.symbol}</span>
                        <span className="ml-2 text-muted-foreground">{s.name}</span>
                      </div>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        {s.sector}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Stock chips for active sector with live price and % change */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
          {(SECTOR_CATEGORIES[activeCategory] || []).map((s) => {
            const q = quickQuotes[s];
            const isSelected = symbol === s;
            const pos = (q?.changePct ?? 0) >= 0;
            return (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isSelected
                    ? "border-transparent bg-gradient-primary text-primary-foreground shadow-glow"
                    : "border-border bg-background/50 text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground"
                }`}
              >
                <span>{s}</span>
                {q && (
                  <span
                    className={`text-[10px] tabular-nums font-semibold ${
                      isSelected
                        ? "text-primary-foreground/90"
                        : pos
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {formatINR(q.price)} ({pos ? "+" : ""}
                    {q.changePct.toFixed(1)}%)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {fLive?.sector || meta.sector}
              {fLive?.industry ? ` · ${fLive.industry}` : ""}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{fLive?.name || meta.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{symbol}.NS · ISIN {meta.isin}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-semibold">{last ? formatINR(last) : "—"}</p>
            <p className={`text-sm ${positive ? "text-success" : "text-destructive"}`}>
              {positive ? "+" : ""}{changePct.toFixed(2)}% period
            </p>
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                aiRec.color === "success"
                  ? "border-success/40 bg-success/10 text-success"
                  : aiRec.color === "destructive"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}
              title={aiRec.reasons.join(" · ")}
            >
              🤖 AI: {aiRec.label}
            </span>
            <p className="mt-1 max-w-[280px] text-[10px] leading-tight text-muted-foreground">
              {aiRec.reasons.slice(0, 3).join(" · ")}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-2 border-b border-border">
          {([
            { id: "overview", label: "Overview" },
            { id: "financials", label: "Financial Performance" },
            { id: "news", label: "News" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}

        </div>

        {tab === "overview" && (
          <>
            <div className="mt-4 grid grid-cols-6 gap-3 text-xs">
              {[
                ["Open", first ? formatINR(first) : "—"],
                ["High", data.length ? formatINR(Math.max(...data.map((d) => d.price))) : "—"],
                ["Low", data.length ? formatINR(Math.min(...data.map((d) => d.price))) : "—"],
                ["Volume", hasVolume ? formatVol(volData[volData.length - 1]?.v ?? 0) : meta.volume],
                ["52W High", fLive?.fiftyTwoWeekHigh ? formatINR(fLive.fiftyTwoWeekHigh) : meta.high52 ? formatINR(meta.high52) : "—"],
                ["52W Low", fLive?.fiftyTwoWeekLow ? formatINR(fLive.fiftyTwoWeekLow) : meta.low52 ? formatINR(meta.low52) : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-muted-foreground">{k}</p>
                  <p className="mt-0.5 font-medium">{v}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              {INTERVALS.map((iv) => (
                <button
                  key={iv.id}
                  onClick={() => setInterval(iv)}
                  className={`rounded-md border px-3 py-1 text-xs ${
                    interval.id === iv.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>

            <div className="mt-4 h-[400px] w-full">
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.018 240 / 40%)" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} minTickGap={40} />
                  <YAxis
                    domain={["dataMin - 5", "dataMax + 5"]}
                    tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }}
                    width={70}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.014 240)",
                      border: "1px solid oklch(0.28 0.018 240)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => formatINR(v)}
                  />
                  <Area type="monotone" dataKey="price" stroke={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"} fill="url(#cG)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {tab === "financials" && <FinancialsTab fin={fin} holdings={holdings} />}
        {tab === "news" && <NewsTab news={news} />}

      </div>

      {/* Market status + Technical levels */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${marketStatus.open ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
            <span className={`font-display text-lg font-semibold ${marketStatus.open ? "text-success" : "text-muted-foreground"}`}>
              {marketStatus.label}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{marketStatus.countdown}</p>
        </div>
        {levels && (
          <>
            <LevelCard label="Target Price" value={formatINR(levels.target)} sub={`Upside: ${levels.upside >= 0 ? "+" : ""}${levels.upside.toFixed(1)}%`} subColor={levels.upside >= 0 ? "text-success" : "text-destructive"} accent="primary" hint={levels.analyst ? "Analyst consensus" : "Technical projection"} />
            <LevelCard label="Support Level" value={formatINR(levels.support)} sub={`Downside: ${levels.downside.toFixed(1)}%`} subColor="text-destructive" accent="success" hint="20-period low" />
            <LevelCard label="Resistance Level" value={formatINR(levels.resistance)} sub={`Overhead: ${levels.overhead >= 0 ? "+" : ""}${levels.overhead.toFixed(1)}%`} subColor="text-warning" accent="warning" hint="20-period high" />
          </>
        )}
      </div>

      {/* Trading zones */}
      {levels && (
        <div className="grid grid-cols-3 gap-4">
          <ZoneCard tone="success" label="Best Entry Zone" range={`${formatINR(levels.entryLow)} — ${formatINR(levels.entryHigh)}`} desc="Ideal buy zone based on technical support" cta="Buy" />
          <ZoneCard tone="primary" label="Best Exit Zone" range={`${formatINR(levels.exitLow)} — ${formatINR(levels.exitHigh)}`} desc="Profit target zone toward analyst target" cta="Sell" />
          <ZoneCard tone="destructive" label="Stop Loss Level" range={formatINR(levels.stopLoss)} desc="Exit here to cap downside risk" cta="Set SL" />
        </div>
      )}

      {/* AI sentiment + Risk metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">AI Sentiment Analysis</h3>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-[140px] w-[140px] shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Buy", value: sentiment.buy, fill: "oklch(0.72 0.17 148)" },
                      { name: "Hold", value: sentiment.hold, fill: "oklch(0.78 0.15 78)" },
                      { name: "Sell", value: sentiment.sell, fill: "oklch(0.65 0.22 25)" },
                    ]}
                    dataKey="value"
                    innerRadius={38}
                    outerRadius={62}
                    stroke="oklch(0.16 0.014 240)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    <Cell />
                    <Cell />
                    <Cell />
                  </Pie>
                  <Tooltip contentStyle={{ background: "oklch(0.16 0.014 240)", border: "1px solid oklch(0.28 0.018 240)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-xs">
              <SentimentRow color="oklch(0.72 0.17 148)" label="Buy Signal" pct={sentiment.buy} />
              <SentimentRow color="oklch(0.78 0.15 78)" label="Hold" pct={sentiment.hold} />
              <SentimentRow color="oklch(0.65 0.22 25)" label="Sell" pct={sentiment.sell} />
            </ul>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">Risk Level</h3>
          <p className={`mt-3 font-display text-3xl font-semibold ${risk.color}`}>{risk.label}</p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-background">
            <div className={`h-full ${risk.label === "Low" ? "w-1/3 bg-success" : risk.label === "Medium" ? "w-2/3 bg-warning" : "w-full bg-destructive"}`} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Derived from realized volatility over the current interval.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">Holding Period</h3>
          <p className="mt-3 font-display text-3xl font-semibold text-primary">Medium</p>
          <p className="mt-3 text-xs text-muted-foreground">Suggested: 3–12 months based on trend + fundamentals.</p>
        </div>
      </div>

      {/* Deep research insight */}
      {(fLive?.summary || meta.about) && (
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Deep Research Insight</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Fundamental Analysis</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{fLive?.name || meta.name}</span>{" "}
            {fLive?.summary || meta.about}
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <li>• Operational trend: {changePct >= 0 ? "improving" : "under pressure"} over the current interval ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%).</li>
            <li>• Analyst view: {fLive?.recommendationKey ? fLive.recommendationKey.replace("_", " ").toUpperCase() : "Not rated"}.</li>
            <li>• Valuation: P/E {peDisplay} · P/B {pbDisplay} · ROE {roeDisplay}.</li>
            <li>• Risk factors: global macro headwinds, sector rotation, and liquidity conditions.</li>
          </ul>
        </div>
      )}



      {/* Fundamentals — expanded reference layout */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Fundamentals</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Live · Yahoo Finance
          </span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-3 text-xs">
          {[
            ["Market Cap", marketCapDisplay],
            ["P/E (TTM)", peDisplay],
            ["P/B Ratio", pbDisplay],
            ["Industry P/E", meta.pe ? meta.pe.toFixed(2) : "—"],
            ["Debt to Equity", deDisplay],
            ["ROE", roeDisplay],
            ["EPS (TTM)", epsDisplay],
            ["Dividend Yield", dyDisplay],
            ["Book Value", bvDisplay],
            ["Face Value", "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border bg-background/40 p-2.5">
              <p className="text-muted-foreground">{k}</p>
              <p className="mt-0.5 font-medium">{v}</p>
            </div>
          ))}
        </div>
        {(fLive?.summary || meta.about) && (
          <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {fLive?.summary || meta.about}
          </p>
        )}
      </div>

      {/* RSI + Volume */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">RSI (14)</h3>
          <p className="mt-2 font-display text-3xl font-semibold">
            {rsi.toFixed(1)}
            <span className={`ml-2 text-xs ${rsi < 30 ? "text-success" : rsi > 70 ? "text-destructive" : "text-muted-foreground"}`}>
              {rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral"}
            </span>
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.min(100, Math.max(0, rsi))}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">RSI below 30 flags oversold, above 70 flags overbought.</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-sm font-semibold">Volume</h3>
            <span className="text-xs text-muted-foreground">
              {hasVolume ? `Latest ${formatVol(volData[volData.length - 1]?.v ?? 0)}` : "No volume data"}
            </span>
          </div>
          <div className="mt-3 h-[160px] w-full">
            {hasVolume ? (
              <ResponsiveContainer>
                <AreaChart data={volData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.15 78)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="oklch(0.78 0.15 78)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.018 240 / 30%)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} minTickGap={48} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} width={52} tickFormatter={formatVol} domain={[0, "dataMax"]} />
                  <Tooltip
                    cursor={{ stroke: "oklch(0.78 0.15 78 / 50%)", strokeWidth: 1 }}
                    contentStyle={{ background: "oklch(0.16 0.014 240)", border: "1px solid oklch(0.28 0.018 240)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [formatVol(v), "Volume"]}
                  />
                  <Area type="monotone" dataKey="v" stroke="oklch(0.78 0.15 78)" strokeWidth={2} fill="url(#vG)" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Volume unavailable for this range
              </div>
            )}
          </div>
        </div>
      </div>

      <DhanConnectModal
        isOpen={dhanModalOpen}
        onClose={() => setDhanModalOpen(false)}
        onStatusChange={(src) => setFeedSource(src)}
      />
    </div>
  );
}

type FinRow = { date: string; ts: number; revenue: number; profit: number };
type FinFilter = "both" | "revenue" | "profit";

const REVENUE_COLOR = "#E7A92A"; // gold
const PROFIT_COLOR = "#22C55E"; // green

function fmtCr(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(1)} Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(1)} L`;
  return `${v.toFixed(0)}`;
}

function buildChartData(rows: FinRow[], mode: "quarterly" | "yearly") {
  // For quarterly QoQ compare to previous quarter; for yearly YoY compare to previous year.
  // For quarterly YoY, compare to same quarter previous year (i-4).
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const revGrowth = prev && prev.revenue ? ((r.revenue - prev.revenue) / prev.revenue) * 100 : 0;
    const profitGrowth =
      prev && prev.profit ? ((r.profit - prev.profit) / Math.abs(prev.profit)) * 100 : 0;
    const yoyBase = mode === "quarterly" ? rows[i - 4] : rows[i - 1];
    const revYoY =
      yoyBase && yoyBase.revenue ? ((r.revenue - yoyBase.revenue) / yoyBase.revenue) * 100 : 0;
    const profitYoY =
      yoyBase && yoyBase.profit
        ? ((r.profit - yoyBase.profit) / Math.abs(yoyBase.profit)) * 100
        : 0;
    return {
      date: r.date,
      Revenue: r.revenue,
      Profit: r.profit,
      revGrowth,
      profitGrowth,
      revYoY,
      profitYoY,
    };
  });
}

function FinancialsChart({
  title,
  subtitle,
  data,
  filter,
  growthKey,
}: {
  title: string;
  subtitle: string;
  data: ReturnType<typeof buildChartData>;
  filter: FinFilter;
  growthKey: "revGrowth" | "revYoY";
}) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-4 text-center text-xs text-muted-foreground">Not reported yet.</p>
      </div>
    );
  }
  const profitGrowthKey = growthKey === "revGrowth" ? "profitGrowth" : "profitYoY";
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: REVENUE_COLOR }} /> Revenue
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: PROFIT_COLOR }} /> Profit
          </span>
        </div>
      </div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.018 240 / 40%)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} />
            <YAxis tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} width={70} tickFormatter={fmtCr} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.16 0.014 240)",
                border: "1px solid oklch(0.28 0.018 240)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => fmtCr(v)}
            />
            {(filter === "both" || filter === "revenue") && (
              <Bar dataKey="Revenue" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey={growthKey}
                  position="top"
                  content={(props: any) => {
                    const { x, y, width, value } = props;
                    if (typeof value !== "number" || value === 0) return null;
                    const sign = value >= 0 ? "+" : "";
                    return (
                      <text
                        x={x + width / 2}
                        y={y - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fill={value >= 0 ? PROFIT_COLOR : "#EF4444"}
                      >
                        {sign}
                        {value.toFixed(0)}%
                      </text>
                    );
                  }}
                />
              </Bar>
            )}
            {(filter === "both" || filter === "profit") && (
              <Bar dataKey="Profit" fill={PROFIT_COLOR} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey={profitGrowthKey}
                  position="top"
                  content={(props: any) => {
                    const { x, y, width, value } = props;
                    if (typeof value !== "number" || value === 0) return null;
                    const sign = value >= 0 ? "+" : "";
                    return (
                      <text
                        x={x + width / 2}
                        y={y - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fill={value >= 0 ? PROFIT_COLOR : "#EF4444"}
                      >
                        {sign}
                        {value.toFixed(0)}%
                      </text>
                    );
                  }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FinancialsTab({ fin, holdings }: { fin: Financials | null; holdings: Holdings | null }) {
  const [filter, setFilter] = useState<FinFilter>("both");
  const updatedAt = useMemo(
    () =>
      new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }),
    [fin],
  );

  const hasFinancials = fin?.ok;
  const quarterly = hasFinancials ? (fin.quarterly as FinRow[]).slice(-8) : [];
  const yearly = hasFinancials ? (fin.yearly as FinRow[]).slice(-5) : [];
  const qData = buildChartData(quarterly, "quarterly");
  const yData = buildChartData(yearly, "yearly");

  return (
    <div className="mt-5 space-y-4">
      <SectorsTab holdings={holdings} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["both", "revenue", "profit"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-1 text-xs capitalize ${
                filter === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Last updated {updatedAt} IST · Auto-refresh on load
        </p>
      </div>

      {!fin ? (
        <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">
          Loading quarterly and yearly results…
        </p>
      ) : !hasFinancials ? (
        <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">
          Quarterly and yearly company results are unavailable for this ETF. Sector allocation and company holdings are shown above.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FinancialsChart
              title="Quarterly Results"
              subtitle="Last 8 quarters · QoQ growth"
              data={qData}
              filter={filter}
              growthKey="revGrowth"
            />
            <FinancialsChart
              title="Yearly Results"
              subtitle="Last 5 years · YoY growth"
              data={yData}
              filter={filter}
              growthKey="revGrowth"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FinTable title="Quarterly detail" data={qData} growthLabel="QoQ" yoyLabel="YoY" />
            <FinTable title="Yearly detail" data={yData} growthLabel="YoY" yoyLabel="" />
          </div>
        </>
      )}
    </div>
  );
}

function FinTable({
  title,
  data,
  growthLabel,
  yoyLabel,
}: {
  title: string;
  data: ReturnType<typeof buildChartData>;
  growthLabel: string;
  yoyLabel: string;
}) {
  if (!data.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Period</th>
              <th className="py-2">Revenue</th>
              <th className="py-2">{growthLabel} %</th>
              {yoyLabel && <th className="py-2">{yoyLabel} %</th>}
              <th className="py-2">Profit</th>
              <th className="py-2">{growthLabel} %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.date} className="border-b border-border/60">
                <td className="py-2">{r.date}</td>
                <td className="py-2">{fmtCr(r.Revenue)}</td>
                <td className={`py-2 ${r.revGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                  {r.revGrowth >= 0 ? "+" : ""}
                  {r.revGrowth.toFixed(1)}%
                </td>
                {yoyLabel && (
                  <td className={`py-2 ${r.revYoY >= 0 ? "text-success" : "text-destructive"}`}>
                    {r.revYoY >= 0 ? "+" : ""}
                    {r.revYoY.toFixed(1)}%
                  </td>
                )}
                <td className="py-2">{fmtCr(r.Profit)}</td>
                <td className={`py-2 ${r.profitGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                  {r.profitGrowth >= 0 ? "+" : ""}
                  {r.profitGrowth.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


type SectorGroup = { name: string; percentage: number; color: string; companies: { symbol: string; name: string; pct: number }[] };

function SectorsTab({ holdings }: { holdings: Holdings | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo<SectorGroup[]>(() => {
    if (!holdings || !holdings.ok) return [];
    const buckets = new Map<string, { symbol: string; name: string; pct: number }[]>();
    for (const h of holdings.holdings ?? []) {
      const key = h.sector || "Other";
      const arr = buckets.get(key) ?? [];
      arr.push({ symbol: h.symbol, name: h.name || h.symbol, pct: h.pct });
      buckets.set(key, arr);
    }
    let list: SectorGroup[] = Array.from(buckets.entries()).map(([sec, companies], i) => ({
      name: sec,
      percentage: Number(companies.reduce((a, b) => a + b.pct, 0).toFixed(2)),
      color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
      companies: companies.sort((a, b) => b.pct - a.pct),
    }));
    if (list.length === 0 || (list.length === 1 && list[0].name === "Other")) {
      list = (holdings.sectorWeightings ?? []).map((sw, i) => ({
        name: titleize(sw.name),
        percentage: Number(sw.pct.toFixed(2)),
        color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
        companies: [],
      }));
    }
    return list.sort((a, b) => b.percentage - a.percentage);
  }, [holdings]);

  if (!holdings) return <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">Loading trending sectors and holdings…</p>;
  if (groups.length === 0)
    return <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">No sector allocation data available for this ticker.</p>;

  const active = groups.find((g) => g.name === selected) ?? groups[0];

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Trending Sectors & ETF Holdings</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sector allocation pie chart with company list</p>
        </div>
        {holdings.ok && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{holdings.name}</span>}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
      <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-background/40 p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trending sectors</p>
        <ul className="space-y-1">
          {groups.map((g) => {
            const on = g.name === active.name;
            return (
              <li key={g.name}>
                <button
                  onClick={() => setSelected(g.name)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                    on ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-accent/40"
                  }`}
                >
                  <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{g.percentage.toFixed(2)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="h-[360px] rounded-xl border border-border bg-background/40 p-3">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={groups}
              dataKey="percentage"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={125}
              paddingAngle={2}
              onClick={(d: any) => d?.name && setSelected(d.name)}
            >
              {groups.map((g) => (
                <Cell
                  key={g.name}
                  fill={g.color}
                  opacity={g.name === active.name ? 1 : 0.55}
                  style={{ cursor: "pointer", outline: "none" }}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "oklch(0.16 0.014 240)", border: "1px solid oklch(0.28 0.018 240)", borderRadius: 8, fontSize: 12 }}
              formatter={(v: any, _n, p: any) => [`${Number(v).toFixed(2)}%`, p.payload.name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-background/40 p-3">
        <p className="mb-2 truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Companies in {active.name}
        </p>
        {active.companies.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No per-company breakdown for this sector.</p>
        ) : (
          <ul className="space-y-1">
            {active.companies.map((c) => (
              <li key={c.symbol + c.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] font-semibold" title={c.name}>{c.symbol || "—"}</p>
                  <p className="truncate text-[10px] text-muted-foreground" title={c.name}>{c.name}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{c.pct.toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}

function NewsTab({ news }: { news: News | null }) {
  if (!news) return <p className="mt-6 text-center text-xs text-muted-foreground">Loading news…</p>;

  if (!news.ok || news.items.length === 0)
    return <p className="mt-6 text-center text-xs text-muted-foreground">No recent news available.</p>;
  return (
    <ul className="mt-5 divide-y divide-border">
      {news.items.map((n: { title: string; link: string; publisher: string; providerPublishTime: number }, i: number) => (
        <li key={`${n.link}-${i}`} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <a
              href={n.link}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 text-sm hover:text-primary"
            >
              {n.title}
            </a>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {n.publisher || "News"} ·{" "}
              {n.providerPublishTime
                ? new Date(n.providerPublishTime).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </p>
          </div>
          <a
            href={n.link}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg border border-border bg-background/50 p-1.5 hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function useMarketStatus() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  // Convert to IST minute-of-day.
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMin = (utcMin + 330) % 1440;
  const istDay = (now.getUTCDay() + (utcMin + 330 >= 1440 ? 1 : 0)) % 7;
  const OPEN = 9 * 60 + 15;
  const CLOSE = 15 * 60 + 30;
  const isWeekday = istDay >= 1 && istDay <= 5;
  const open = isWeekday && istMin >= OPEN && istMin < CLOSE;
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const s = 60 - now.getUTCSeconds();
    return `${h}h ${m}m ${s === 60 ? 0 : s}s`;
  };
  if (open) return { open: true, label: "Market Open", countdown: `Closes in ${fmt(CLOSE - istMin - 1)}` };
  // Time until next open
  let mins = 0;
  if (!isWeekday) {
    const daysToMon = istDay === 6 ? 2 : istDay === 0 ? 1 : 0;
    mins = daysToMon * 1440 + (OPEN - istMin);
  } else if (istMin < OPEN) {
    mins = OPEN - istMin;
  } else {
    mins = (istDay === 5 ? 3 : 1) * 1440 - istMin + OPEN;
  }
  return { open: false, label: "Market Closed", countdown: `Opens in ${fmt(mins)}` };
}

function LevelCard({ label, value, sub, subColor, hint }: { label: string; value: string; sub: string; subColor: string; accent: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-primary">{value}</p>
      <p className={`mt-1 text-xs ${subColor}`}>{sub}</p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ZoneCard({ tone, label, range, desc, cta }: { tone: "success" | "primary" | "destructive"; label: string; range: string; desc: string; cta: string }) {
  const border = tone === "success" ? "border-success/40 bg-success/5" : tone === "destructive" ? "border-destructive/40 bg-destructive/5" : "border-primary/40 bg-primary/5";
  const btn = tone === "success" ? "bg-success text-background hover:opacity-90" : tone === "destructive" ? "bg-destructive text-background hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-90";
  const val = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <div className={`rounded-2xl border p-5 ${border}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-xl font-semibold ${val}`}>{range}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <button className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold ${btn}`}>{cta}</button>
    </div>
  );
}

function SentimentRow({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono font-semibold text-foreground">{pct}%</span>
    </li>
  );
}

