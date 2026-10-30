import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { formatINR } from "@/lib/market-data";
import { NEWS } from "@/lib/desktop-data";
import { NIFTY_UNIVERSE, NIFTY_YAHOO_SYMBOLS } from "@/lib/nifty-universe";
import { getYahooQuotes } from "@/lib/yahoo.functions";
import { getIndianStockQuotes } from "@/lib/indian-stocks.functions";
import { useRecentViewed } from "@/lib/recent-viewed";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  Clock,
  Search,
  Sparkles,
  Briefcase,
  Zap,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { getDhanHoldings } from "@/lib/dhan.functions";
import { DhanConnectModal } from "@/components/DhanConnectModal";

export const Route = createFileRoute("/desktop/")({
  component: DesktopDashboard,
});

type LiveQuote = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
};

function DesktopDashboard() {
  const fetchQuotes = useServerFn(getYahooQuotes);
  const fetchIndianQuotes = useServerFn(getIndianStockQuotes);
  const fetchHoldings = useServerFn(getDhanHoldings);
  const recent = useRecentViewed();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const [indices, setIndices] = useState<LiveQuote[]>([]);
  const [feedSource, setFeedSource] = useState<string>("DhanHQ Live Direct Feed");
  const [dhanData, setDhanData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dhanModalOpen, setDhanModalOpen] = useState(false);
  const loadingRef = useRef(false);
  const [live, setLive] = useState(true);
  const [heroQuery, setHeroQuery] = useState("");
  const heroSuggest = useMemo(() => {
    const q = heroQuery.trim().toUpperCase();
    if (!q) return [];
    return NIFTY_UNIVERSE.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q),
    ).slice(0, 6);
  }, [heroQuery]);
  const runHeroSearch = (sym: string) => {
    const s = (sym || heroQuery).trim().toUpperCase().replace(/\.NS$/, "");
    if (!s) return;
    setHeroQuery("");
    navigate({ to: "/desktop/charts", search: { symbol: s } });
  };

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [stocksResult, indicesResult, dhanResult] = await Promise.allSettled([
        fetchIndianQuotes({ data: {} }),
        fetchQuotes({ data: { symbols: "^NSEI,^BSESN,^NSEBANK,^CNXIT" } }),
        fetchHoldings(),
      ]);
      const stocksRes = stocksResult.status === "fulfilled" ? stocksResult.value : null;
      const idxRes = indicesResult.status === "fulfilled" ? indicesResult.value : null;
      if (dhanResult.status === "fulfilled" && dhanResult.value?.ok) {
        setDhanData(dhanResult.value);
      }
      if (stocksRes?.ok && stocksRes.quotes?.length) {
        setQuotes(
          stocksRes.quotes.map((q) => ({
            symbol: q.symbol,
            name: q.name,
            price: q.price,
            changePct: q.changePct,
            volume: q.volume,
          })),
        );
        if (stocksRes.feedSource) setFeedSource(stocksRes.feedSource);
      }
      if (idxRes?.ok) {
        const labels: Record<string, string> = {
          "^NSEI": "NIFTY 50",
          "^BSESN": "SENSEX",
          "^NSEBANK": "BANK NIFTY",
          "^CNXIT": "NIFTY IT",
        };
        const order = ["^NSEI", "^BSESN", "^NSEBANK", "^CNXIT"];
        const mapped = idxRes.quotes.map((q) => ({
          symbol: labels[q.symbol] ?? q.symbol,
          name: q.symbol,
          price: q.price,
          changePct: q.changePct,
          volume: q.volume,
        }));
        mapped.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
        setIndices(mapped);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchIndianQuotes, fetchQuotes, fetchHoldings]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [live, load]);

  const gainers = useMemo(
    () =>
      [...quotes]
        .filter((q) => q.changePct > 0)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 5),
    [quotes],
  );
  const losers = useMemo(
    () =>
      [...quotes]
        .filter((q) => q.changePct < 0)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 5),
    [quotes],
  );

  const sectors = useMemo(() => {
    const bySector = new Map<
      string,
      { up: number; down: number; avgPct: number; total: number; sum: number }
    >();
    for (const q of quotes) {
      const sec = NIFTY_UNIVERSE.find((s) => s.symbol === q.symbol)?.sector ?? "Other";
      const cur = bySector.get(sec) ?? { up: 0, down: 0, avgPct: 0, total: 0, sum: 0 };
      cur.total += 1;
      cur.sum += q.changePct;
      if (q.changePct >= 0) cur.up += 1;
      else cur.down += 1;
      bySector.set(sec, cur);
    }
    return Array.from(bySector.entries())
      .map(([sec, v]) => ({
        sector: sec,
        up: v.up,
        down: v.down,
        total: v.total,
        avgPct: v.total ? v.sum / v.total : 0,
      }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [quotes]);

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<"top5" | "gainers" | "losers" | "all">("top5");

  const displayedSectors = useMemo(() => {
    if (sectorFilter === "top5") return sectors.slice(0, 5);
    if (sectorFilter === "gainers") return sectors.filter((s) => s.avgPct > 0);
    if (sectorFilter === "losers") return sectors.filter((s) => s.avgPct < 0);
    return sectors;
  }, [sectors, sectorFilter]);

  const activeSector = useMemo(() => {
    if (selectedSector) {
      const found = sectors.find((s) => s.sector.toLowerCase() === selectedSector.toLowerCase());
      if (found) return found;
    }
    return displayedSectors[0] ?? sectors[0] ?? null;
  }, [sectors, displayedSectors, selectedSector]);

  const activeSectorStocks = useMemo(() => {
    if (!activeSector) return [];
    return quotes
      .filter((q) => {
        const sec = NIFTY_UNIVERSE.find((s) => s.symbol === q.symbol)?.sector;
        return sec?.toLowerCase() === activeSector.sector.toLowerCase();
      })
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 5); // strictly only 5 stocks
  }, [quotes, activeSector]);

  const hasLive = quotes.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Market indices</h2>
            <button
              onClick={() => setDhanModalOpen(true)}
              title="Click to connect or manage DhanHQ API feed"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
            >
              <Zap className="h-3 w-3" />
              <span>{feedSource}</span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Live · Auto-refresh every 10s</p>
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
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Recently viewed — compact watchlist cards */}
      <div className="rounded-2xl border border-border bg-surface/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">Recently viewed</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {recent.length === 0 ? "Open a stock to start tracking" : `${recent.length} stocks`}
          </p>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No recently viewed stocks yet — search a ticker or open one from the movers below.
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {recent.map((sym) => {
              const q = quotes.find((x) => x.symbol === sym);
              const meta = NIFTY_UNIVERSE.find((s) => s.symbol === sym);
              const pos = (q?.changePct ?? 0) >= 0;
              return (
                <Link
                  key={sym}
                  to="/desktop/charts"
                  search={{ symbol: sym }}
                  className={`group relative rounded-xl border bg-background/50 p-3 transition hover:bg-accent ${
                    q
                      ? pos
                        ? "border-success/30 hover:border-success/60"
                        : "border-destructive/30 hover:border-destructive/60"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {sym}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">
                    {q?.name ?? meta?.name ?? "—"}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="font-display text-base font-semibold">
                      {q ? formatINR(q.price) : "—"}
                    </p>
                    {q && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                          pos ? "text-success" : "text-destructive"
                        }`}
                      >
                        {pos ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {pos ? "+" : ""}
                        {q.changePct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Indices strip (live) */}
      <div className="grid grid-cols-4 gap-3 rounded-2xl border border-border bg-surface/50 p-4">
        {(indices.length > 0
          ? indices
          : [
              { symbol: "NIFTY 50", name: "^NSEI", price: 0, changePct: 0, volume: 0 },
              { symbol: "SENSEX", name: "^BSESN", price: 0, changePct: 0, volume: 0 },
              { symbol: "BANK NIFTY", name: "^NSEBANK", price: 0, changePct: 0, volume: 0 },
              { symbol: "NIFTY IT", name: "^CNXIT", price: 0, changePct: 0, volume: 0 },
            ]
        ).map((i) => {
          const pos = i.changePct >= 0;
          return (
            <div key={i.symbol} className="rounded-xl border border-border bg-background/50 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {i.symbol}
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                {i.price > 0 ? i.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
              </p>
              <p className={`text-xs ${pos ? "text-success" : "text-destructive"}`}>
                {i.price > 0 ? `${pos ? "+" : ""}${i.changePct.toFixed(2)}%` : "Loading…"}
              </p>
            </div>
          );
        })}
      </div>

      {/* DhanHQ Connected Portfolio */}
      {dhanData?.ok && dhanData?.holdings?.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-surface/70 p-5 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Briefcase className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold">DhanHQ Portfolio</h2>
                  {dhanData.connected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Synced · Client {dhanData.clientId || "1114340693"}
                    </span>
                  ) : (
                    <button
                      onClick={() => setDhanModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                    >
                      <Zap className="h-3 w-3" />
                      Connect Token
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Direct DhanHQ API v2 feed · {dhanData.holdings.length} assets held
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Current Value
                </p>
                <p className="font-display text-lg font-bold">
                  {formatINR(dhanData.summary.totalCurrent)}
                </p>
              </div>
              <div className="border-l border-border pl-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total P&amp;L
                </p>
                <p
                  className={`font-display text-lg font-bold ${
                    dhanData.summary.totalPnl >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {dhanData.summary.totalPnl >= 0 ? "+" : ""}
                  {formatINR(dhanData.summary.totalPnl)}
                  <span className="ml-1 text-xs font-normal">
                    ({dhanData.summary.totalPnl >= 0 ? "+" : ""}
                    {dhanData.summary.totalPnlPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
              <button
                onClick={() => setDhanModalOpen(true)}
                className="rounded-lg border border-border bg-background/50 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition flex items-center gap-1"
                title="Manage DhanHQ Account"
              >
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">DhanHQ</span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {dhanData.holdings.map((h: any) => {
              const pos = h.pnl >= 0;
              return (
                <Link
                  key={h.symbol}
                  to="/desktop/charts"
                  search={{ symbol: h.symbol }}
                  className="group rounded-xl border border-border/70 bg-background/50 p-3 transition hover:border-emerald-500/50 hover:bg-accent"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-xs text-foreground group-hover:text-emerald-500">
                      {h.symbol}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground transition group-hover:text-emerald-500" />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Qty: {h.quantity} · Avg {formatINR(h.averagePrice)}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="font-display text-xs font-medium">
                      {formatINR(h.currentPrice)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${pos ? "text-success" : "text-destructive"}`}
                    >
                      {pos ? "+" : ""}
                      {h.pnlPct.toFixed(1)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <MoverCard title="Top gainers (live)" quotes={gainers} up />
        <MoverCard title="Top losers (live)" quotes={losers} />
      </div>

      <DhanConnectModal
        isOpen={dhanModalOpen}
        onClose={() => setDhanModalOpen(false)}
        onStatusChange={(src) => setFeedSource(src)}
      />

      {/* Trending sectors — advance/decline split format */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Trending sectors</h2>
              {activeSector && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {activeSector.sector}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live advance-decline momentum &amp; average sector performance
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <div className="inline-flex rounded-lg border border-border bg-background/50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setSectorFilter("top5")}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  sectorFilter === "top5"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Top 5
              </button>
              <button
                type="button"
                onClick={() => setSectorFilter("gainers")}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  sectorFilter === "gainers"
                    ? "bg-emerald-500/20 text-emerald-400 font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Gainers
              </button>
              <button
                type="button"
                onClick={() => setSectorFilter("losers")}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  sectorFilter === "losers"
                    ? "bg-rose-500/20 text-rose-400 font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Losers
              </button>
              <button
                type="button"
                onClick={() => setSectorFilter("all")}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  sectorFilter === "all"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({sectors.length})
              </button>
            </div>

            {activeSector && (
              <Link
                to="/desktop/sector/$name"
                params={{ name: activeSector.sector }}
                className="hidden sm:inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium ml-1"
              >
                <span>{activeSector.sector} page</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {sectors.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading sector data…</p>
        ) : (
          <div className="space-y-4">
            {/* Advance/Decline Sector Rows matching requested format */}
            <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-background/50 overflow-hidden shadow-inner">
              {displayedSectors.map((s) => {
                const isActive = activeSector?.sector.toLowerCase() === s.sector.toLowerCase();
                const pos = s.avgPct >= 0;
                const totalUpDown = s.up + s.down;
                const upPct = totalUpDown > 0 ? (s.up / totalUpDown) * 100 : 50;
                const downPct = 100 - upPct;

                return (
                  <div
                    key={s.sector}
                    onClick={() => setSelectedSector(s.sector)}
                    className={`group flex items-center justify-between gap-3 sm:gap-6 px-4 py-3.5 sm:px-5 transition-all cursor-pointer ${
                      isActive
                        ? "bg-primary/10 border-l-4 border-l-primary"
                        : "hover:bg-accent/40"
                    }`}
                  >
                    {/* Sector Name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`font-semibold text-xs sm:text-sm md:text-base truncate transition-colors ${
                          isActive ? "text-primary font-bold" : "text-foreground group-hover:text-primary"
                        }`}
                      >
                        {s.sector}
                      </span>
                      {isActive && (
                        <span className="hidden sm:inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Advance / Decline Bar & Counts */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <span className="w-5 sm:w-6 text-right font-mono text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">
                        {s.up}
                      </span>
                      <div className="w-24 sm:w-48 md:w-64 lg:w-80 h-2 sm:h-2.5 rounded-full overflow-hidden flex bg-muted/40 shrink-0">
                        {totalUpDown === 0 ? (
                          <div className="h-full w-full bg-muted/30" />
                        ) : (
                          <>
                            {s.up > 0 && (
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${s.down === 0 ? 100 : upPct}%` }}
                              />
                            )}
                            {s.down > 0 && (
                              <div
                                className="h-full bg-rose-500 transition-all duration-300"
                                style={{ width: `${s.up === 0 ? 100 : downPct}%` }}
                              />
                            )}
                          </>
                        )}
                      </div>
                      <span className="w-5 sm:w-6 text-left font-mono text-xs sm:text-sm font-bold text-rose-400 tabular-nums">
                        {s.down}
                      </span>
                    </div>

                    {/* Sector Return & Chevron Link */}
                    <div className="flex items-center justify-end gap-1.5 shrink-0 min-w-[80px] sm:min-w-[105px] text-right">
                      <span
                        className={`font-mono text-xs sm:text-sm font-bold tabular-nums ${
                          pos ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {pos ? "+" : ""}
                        {s.avgPct.toFixed(2)}%
                      </span>
                      <Link
                        to="/desktop/sector/$name"
                        params={{ name: s.sector }}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition group-hover:translate-x-0.5"
                        title={`Open ${s.sector} sector details`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Helper footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>
                Click any sector row to display its top 5 stocks below
              </span>
              {sectors.length > 5 && (
                <button
                  type="button"
                  onClick={() => setSectorFilter(sectorFilter === "top5" ? "all" : "top5")}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
                >
                  {sectorFilter === "top5" ? (
                    <>
                      <span>Show all {sectors.length} sectors</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      <span>Show top 5 only</span>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Exactly 5 Stocks for the Selected Trending Sector */}
            {activeSector && (
              <div className="pt-3 border-t border-border/50">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-sm font-semibold">
                      Top 5 stocks in {activeSector.sector}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Ranked by performance in the {activeSector.sector} sector
                    </p>
                  </div>
                  <Link
                    to="/desktop/sector/$name"
                    params={{ name: activeSector.sector }}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                  >
                    <span>Full {activeSector.sector} sector view</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {activeSectorStocks.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No stock data available for {activeSector?.sector}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {activeSectorStocks.map((s, idx) => {
                      const pos = s.changePct >= 0;
                      return (
                        <Link
                          key={s.symbol}
                          to="/desktop/charts"
                          search={{ symbol: s.symbol }}
                          className="group flex flex-col justify-between rounded-xl border border-border bg-background/50 p-3.5 transition hover:border-primary/60 hover:bg-accent hover:shadow-glow"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-xs font-bold text-primary group-hover:underline">
                                {s.symbol}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                                #{idx + 1}
                              </span>
                            </div>
                            <p
                              className="mt-1 line-clamp-1 text-[11px] text-muted-foreground"
                              title={s.name}
                            >
                              {s.name}
                            </p>
                          </div>

                          <div className="mt-3 flex items-end justify-between pt-2 border-t border-border/40">
                            <span className="font-display text-sm font-semibold text-foreground">
                              {formatINR(s.price)}
                            </span>
                            <span
                              className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                                pos ? "text-success" : "text-destructive"
                              }`}
                            >
                              {pos ? (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              )}
                              {pos ? "+" : ""}
                              {s.changePct.toFixed(2)}%
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* News */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <h2 className="font-display text-lg font-semibold">Market news</h2>
        <ul className="mt-4 divide-y divide-border">
          {NEWS.map((n) => (
            <li key={n.title} className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="text-sm">{n.title}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {n.stock} · {n.time}
                </p>
              </div>
              <Link
                to="/desktop/charts"
                search={{ symbol: n.stock }}

                className="shrink-0 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs hover:bg-accent"
              >
                Chart
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MoverCard({ title, quotes, up }: { title: string; quotes: LiveQuote[]; up?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        {up ? (
          <ArrowUpRight className="h-4 w-4 text-success" />
        ) : (
          <ArrowDownRight className="h-4 w-4 text-destructive" />
        )}
      </div>
      {quotes.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Waiting for live data…</p>
      ) : (
        <ul className="space-y-2">
          {quotes.map((s) => (
            <li key={s.symbol}>
              <Link
                to="/desktop/charts"
                search={{ symbol: s.symbol }}
                className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 transition hover:border-primary/60 hover:bg-accent hover:shadow-glow"
              >
                <div>
                  <p className="text-sm font-bold text-primary">{s.symbol}</p>
                  <p className="text-[11px] text-muted-foreground">{s.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{formatINR(s.price)}</p>
                  <p
                    className={`text-xs font-semibold ${s.changePct >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {s.changePct >= 0 ? "+" : ""}
                    {s.changePct.toFixed(2)}%
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
