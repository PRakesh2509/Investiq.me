import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { formatINR } from "@/lib/market-data";
import { NEWS } from "@/lib/desktop-data";
import { NIFTY_UNIVERSE, NIFTY_YAHOO_SYMBOLS } from "@/lib/nifty-universe";
import { getYahooQuotes } from "@/lib/yahoo.functions";
import { useRecentViewed } from "@/lib/recent-viewed";
import { ArrowDownRight, ArrowUpRight, ExternalLink, RefreshCw, Clock, Search, Sparkles, Briefcase } from "lucide-react";
import { getGrowwHoldings } from "@/lib/groww.functions";

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
  const fetchHoldings = useServerFn(getGrowwHoldings);
  const recent = useRecentViewed();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const [indices, setIndices] = useState<LiveQuote[]>([]);
  const [growwData, setGrowwData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [live, setLive] = useState(true);
  const [heroQuery, setHeroQuery] = useState("");
  const heroSuggest = useMemo(() => {
    const q = heroQuery.trim().toUpperCase();
    if (!q) return [];
    return NIFTY_UNIVERSE.filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)).slice(0, 6);
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
      const [stocksResult, indicesResult, growwResult] = await Promise.allSettled([
        fetchQuotes({ data: { symbols: NIFTY_YAHOO_SYMBOLS } }),
        fetchQuotes({ data: { symbols: "^NSEI,^BSESN,^NSEBANK,^CNXIT" } }),
        fetchHoldings(),
      ]);
      const stocksRes = stocksResult.status === "fulfilled" ? stocksResult.value : null;
      const idxRes = indicesResult.status === "fulfilled" ? indicesResult.value : null;
      if (growwResult.status === "fulfilled" && growwResult.value?.ok) {
        setGrowwData(growwResult.value);
      }
      if (stocksRes?.ok) {
        setQuotes(
          stocksRes.quotes.map((q) => ({
            symbol: q.symbol.replace(/\.NS$/i, ""),
            name: q.name,
            price: q.price,
            changePct: q.changePct,
            volume: q.volume,
          })),
        );
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
        mapped.sort(
          (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
        );
        setIndices(mapped);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchQuotes, fetchHoldings]);


  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => { void load(); }, 10_000);
    return () => window.clearInterval(id);
  }, [live, load]);

  const gainers = useMemo(
    () => [...quotes].filter((q) => q.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 5),
    [quotes],
  );
  const losers = useMemo(
    () => [...quotes].filter((q) => q.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 5),
    [quotes],
  );

  const sectors = useMemo(() => {
    const bySector = new Map<string, { up: number; down: number; avgPct: number; total: number; sum: number }>();
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
      .map(([sec, v]) => ({ sector: sec, up: v.up, down: v.down, total: v.total, avgPct: v.total ? v.sum / v.total : 0 }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [quotes]);

  const hasLive = quotes.length > 0;

  return (
    <div className="space-y-6">
      {/* Order Block Engine CTA Banner */}
      <Link
        to="/desktop/terminal"
        className="group relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4 overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#071318] via-[#091d24] to-[#040d12] p-5 shadow-lg transition hover:border-cyan-400/60"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-400">
            <span className="font-mono text-sm font-bold">OBE</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-foreground">ORDER BLOCK ENGINE</span>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                NSE LIVE · NIFTY 50 &amp; GLOBAL
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Multi-pivot confluence, live TradingView chart, dynamic trailing SL, option chain &amp; telegram execution alerts.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-400 group-hover:underline shrink-0">
          Launch Workstation →
        </div>
      </Link>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Market indices</h2>
          <p className="text-xs text-muted-foreground">Live · Auto-refresh every 10s</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-primary" />
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
                    q ? (pos ? "border-success/30 hover:border-success/60" : "border-destructive/30 hover:border-destructive/60") : "border-border"
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
                        {pos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
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
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{i.symbol}</p>
              <p className="mt-1 font-display text-lg font-semibold">
                {i.price > 0
                  ? i.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                  : "—"}
              </p>
              <p className={`text-xs ${pos ? "text-success" : "text-destructive"}`}>
                {i.price > 0
                  ? `${pos ? "+" : ""}${i.changePct.toFixed(2)}%`
                  : "Loading…"}
              </p>
            </div>
          );
        })}
      </div>





      {/* Groww Connected Portfolio */}
      {growwData?.ok && growwData?.holdings?.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-surface/70 p-5 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Briefcase className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold">Groww Portfolio</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Synced
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Direct Groww Trading API feed · {growwData.holdings.length} assets held
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Value</p>
                <p className="font-display text-lg font-bold">{formatINR(growwData.summary.totalCurrent)}</p>
              </div>
              <div className="border-l border-border pl-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total P&amp;L</p>
                <p
                  className={`font-display text-lg font-bold ${
                    growwData.summary.totalPnl >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {growwData.summary.totalPnl >= 0 ? "+" : ""}
                  {formatINR(growwData.summary.totalPnl)}
                  <span className="ml-1 text-xs font-normal">
                    ({growwData.summary.totalPnl >= 0 ? "+" : ""}
                    {growwData.summary.totalPnlPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {growwData.holdings.map((h: any) => {
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
                    <span className="font-display text-xs font-medium">{formatINR(h.currentPrice)}</span>
                    <span className={`text-[11px] font-semibold ${pos ? "text-success" : "text-destructive"}`}>
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

      {/* Sector heatmap */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Trending sectors</h2>
            <p className="text-xs text-muted-foreground">Average % change across tracked Nifty constituents</p>
          </div>
        </div>
        {sectors.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading sector data…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sectors.map((s) => {
              const pos = s.avgPct >= 0;
              const width = Math.min(100, Math.abs(s.avgPct) * 40);
              return (
                <Link
                  key={s.sector}
                  to="/desktop/sector/$name"
                  params={{ name: s.sector }}
                  className="group rounded-xl border border-border bg-background/40 p-3 transition hover:border-primary/60 hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium group-hover:text-primary">{s.sector}</p>
                    <p className={`text-sm font-semibold ${pos ? "text-success" : "text-destructive"}`}>
                      {pos ? "+" : ""}
                      {s.avgPct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>🟢 {s.up} up</span>
                    <span>🔴 {s.down} down</span>
                    <span className="ml-auto">{s.total} stocks →</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className={`h-full rounded-full ${pos ? "bg-success" : "bg-destructive"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </Link>
              );
            })}
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
        {up ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
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
                  <p className={`text-xs font-semibold ${s.changePct >= 0 ? "text-success" : "text-destructive"}`}>
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
