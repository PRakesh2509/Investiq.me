import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STOCKS, formatINR } from "@/lib/market-data";
import { computeRSI } from "@/lib/desktop-data";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";
import { PremiumLoader } from "@/components/PremiumLoader";
import { getIndianStockQuotes } from "@/lib/indian-stocks.functions";
import { pushRecentViewed } from "@/lib/recent-viewed";
import { RefreshCw, Zap } from "lucide-react";
import { DhanConnectModal } from "@/components/DhanConnectModal";
import { DataQualityBadges } from "@/components/DataQualityBadges";
import { INTERVALS, SECTOR_CATEGORIES, type Tab } from "@/components/charts/constants";
import { useStockCharts } from "@/components/charts/useStockCharts";
import { useMarketStatus } from "@/components/charts/useMarketStatus";
import { StockSelector } from "@/components/charts/StockSelector";
import { FinancialsTab } from "@/components/charts/FinancialsTab";
import { NewsTab } from "@/components/charts/NewsTab";
import { AnalysisCards, type Levels } from "@/components/charts/AnalysisCards";
import { FundamentalsSection } from "@/components/charts/FundamentalsSection";
import { RsiVolumeSection } from "@/components/charts/RsiVolumeSection";

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
function DesktopCharts() {
  const search = Route.useSearch();
  const [symbol, setSymbol] = useState(search.symbol || "RELIANCE");
  const [interval, setInterval] = useState(INTERVALS[1]);
  const [tab, setTab] = useState<Tab>(search.tab || "overview");
  useEffect(() => {
    if (search.symbol) setSymbol(search.symbol);
    if (search.tab) setTab(search.tab as Tab);
  }, [search.symbol, search.tab]);
  useEffect(() => {
    if (symbol) pushRecentViewed(symbol);
  }, [symbol]);

  const [dhanModalOpen, setDhanModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Top 10");
  const [quickQuotes, setQuickQuotes] = useState<
    Record<string, { price: number; changePct: number }>
  >({});
  const [live, setLive] = useState(true);

  const {
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
    reload,
  } = useStockCharts(symbol, interval, live);
  const fetchIndianQuotes = useServerFn(getIndianStockQuotes);

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
      } catch {
        // Quote chips simply stay without prices when the quotes endpoint fails.
      }
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

  const rsi = useMemo(() => computeRSI(data.map((d) => d.price)), [data]);
  const volData = useMemo(() => data.map((d) => ({ t: d.t, v: d.volume })), [data]);
  const hasVolume = useMemo(() => volData.some((d) => d.v > 0), [volData]);
  const formatVol = (v: number) =>
    v >= 1e7
      ? `${(v / 1e7).toFixed(2)} Cr`
      : v >= 1e5
        ? `${(v / 1e5).toFixed(2)} L`
        : v >= 1e3
          ? `${(v / 1e3).toFixed(1)}K`
          : String(v);
  const formatCr = (v: number) =>
    v >= 1e12
      ? `₹${(v / 1e12).toFixed(2)}L Cr`
      : v >= 1e7
        ? `₹${(v / 1e7).toFixed(2)} Cr`
        : v >= 1e5
          ? `₹${(v / 1e5).toFixed(2)} L`
          : `₹${v.toFixed(0)}`;

  const last = data[data.length - 1]?.price ?? 0;
  const first = data[0]?.price ?? 0;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const positive = changePct >= 0;

  // Live fundamentals (Yahoo) with fallback to static meta.
  const fLive = fund && fund.ok ? fund : null;
  const marketCapDisplay =
    fLive?.marketCapFmt || (fLive?.marketCap ? formatCr(fLive.marketCap) : meta.marketCap);
  const peDisplay = fLive?.peTTM ? fLive.peTTM.toFixed(2) : meta.pe ? meta.pe.toFixed(2) : "—";
  const pbDisplay = fLive?.pbRatio ? fLive.pbRatio.toFixed(2) : "—";
  const deDisplay = fLive?.debtToEquity ? (fLive.debtToEquity / 100).toFixed(2) : "—";
  const roeDisplay = fLive?.roe ? `${fLive.roe.toFixed(2)}%` : "—";
  const epsDisplay = fLive?.epsTTM ? fLive.epsTTM.toFixed(2) : meta.eps ? meta.eps.toFixed(2) : "—";
  const dyDisplay = fLive?.dividendYield
    ? `${fLive.dividendYield.toFixed(2)}%`
    : meta.divYield
      ? `${meta.divYield.toFixed(2)}%`
      : "—";
  const bvDisplay = fLive?.bookValue ? fLive.bookValue.toFixed(2) : "—";

  // AI Recommendation — combines RSI + momentum + fundamentals + Yahoo analyst view.
  const aiRec = useMemo(() => {
    let score = 0;
    const reasons: string[] = [];
    if (rsi < 30) {
      score += 2;
      reasons.push("RSI oversold");
    } else if (rsi > 70) {
      score -= 2;
      reasons.push("RSI overbought");
    }
    if (changePct > 2) {
      score += 1;
      reasons.push("Positive momentum");
    } else if (changePct < -2) {
      score -= 1;
      reasons.push("Negative momentum");
    }
    const pe = fLive?.peTTM ?? meta.pe;
    if (pe > 0 && pe < 25) {
      score += 1;
      reasons.push("Reasonable P/E");
    } else if (pe > 60) {
      score -= 1;
      reasons.push("Rich P/E");
    }
    const dy = fLive?.dividendYield ?? meta.divYield;
    if (dy && dy > 1.5) {
      score += 1;
      reasons.push("Dividend support");
    }
    if (fLive?.roe && fLive.roe > 15) {
      score += 1;
      reasons.push("Strong ROE");
    }
    if (fLive?.recommendationKey === "buy" || fLive?.recommendationKey === "strong_buy") {
      score += 1;
      reasons.push("Analyst BUY");
    } else if (fLive?.recommendationKey === "sell") {
      score -= 1;
      reasons.push("Analyst SELL");
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
  const fundamentalRows: Array<[string, string]> = [
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
  ];

  if (loading && data.length === 0 && !error) {
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
            <DataQualityBadges
              flags={{
                isSimulated,
                freshnessStatus: error && data.length > 0 ? "stale" : undefined,
              }}
            />
            <span>
              Real-time price feed, historical performance &amp; latest news · auto-refresh every
              10s
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="accent-primary"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => void reload()}
            aria-label="Refresh price data"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <StockSelector
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        symbol={symbol}
        setSymbol={setSymbol}
        quickQuotes={quickQuotes}
      />

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {fLive?.sector || meta.sector}
              {fLive?.industry ? ` · ${fLive.industry}` : ""}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{fLive?.name || meta.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {symbol}.NS · ISIN {meta.isin}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-semibold">{last ? formatINR(last) : "—"}</p>
            <p className={`text-sm ${positive ? "text-success" : "text-destructive"}`}>
              {positive ? "+" : ""}
              {changePct.toFixed(2)}% period
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
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "financials", label: "Financial Performance" },
              { id: "news", label: "News" },
            ] as const
          ).map((t) => (
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
                [
                  "Volume",
                  hasVolume ? formatVol(volData[volData.length - 1]?.v ?? 0) : meta.volume,
                ],
                [
                  "52W High",
                  fLive?.fiftyTwoWeekHigh
                    ? formatINR(fLive.fiftyTwoWeekHigh)
                    : meta.high52
                      ? formatINR(meta.high52)
                      : "—",
                ],
                [
                  "52W Low",
                  fLive?.fiftyTwoWeekLow
                    ? formatINR(fLive.fiftyTwoWeekLow)
                    : meta.low52
                      ? formatINR(meta.low52)
                      : "—",
                ],
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

            {error && data.length === 0 ? (
              <div
                role="alert"
                className="mt-4 flex h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive"
              >
                <span>{error}</span>
                <button
                  onClick={() => void reload()}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold hover:bg-destructive/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
              </div>
            ) : (
              <div className="mt-4 h-[400px] w-full">
                <ResponsiveContainer>
                  <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cG" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"}
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="100%"
                          stopColor={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.018 240 / 40%)" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }}
                      minTickGap={40}
                    />
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
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"}
                      fill="url(#cG)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {tab === "financials" && <FinancialsTab fin={fin} holdings={holdings} />}
        {tab === "news" && <NewsTab news={news} />}
      </div>

      <AnalysisCards
        marketStatus={marketStatus}
        levels={levels}
        sentiment={sentiment}
        risk={risk}
      />

      <FundamentalsSection
        fLive={fLive}
        meta={meta}
        changePct={changePct}
        peDisplay={peDisplay}
        pbDisplay={pbDisplay}
        roeDisplay={roeDisplay}
        rows={fundamentalRows}
      />

      <RsiVolumeSection rsi={rsi} hasVolume={hasVolume} volData={volData} formatVol={formatVol} />

      <DhanConnectModal
        isOpen={dhanModalOpen}
        onClose={() => setDhanModalOpen(false)}
        onStatusChange={(src) => setFeedSource(src)}
      />
    </div>
  );
}
