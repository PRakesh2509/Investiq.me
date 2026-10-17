import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Brain,
  ShieldCheck,
  Search,
  TrendingUp,
  Zap,
  DollarSign,
  Bitcoin,
  Sparkles,
} from "lucide-react";
import {
  DisclaimerModal,
  useDisclaimerAcknowledged,
} from "@/components/DisclaimerModal";
import { NIFTY_UNIVERSE, NIFTY_YAHOO_SYMBOLS } from "@/lib/nifty-universe";
import { getYahooQuotes } from "@/lib/yahoo.functions";
import { formatINR } from "@/lib/market-data";
const logoAsset = { url: "/investiq-logo.png" };


export const Route = createFileRoute("/")({
  component: LandingPage,
});

type LiveQuote = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
};

// India market hours: 09:15–15:30 IST, Mon–Fri
function useMarketStatus() {
  // Start null so SSR and the first client render agree, then tick on the client.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ist = new Date((now ?? new Date(0)).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const openMin = 9 * 60 + 15;
  const closeMin = 15 * 60 + 30;
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && mins >= openMin && mins < closeMin;
  let target: Date;
  if (isOpen) {
    target = new Date(ist);
    target.setHours(15, 30, 0, 0);
  } else {
    target = new Date(ist);
    // Next open
    if (isWeekday && mins < openMin) {
      target.setHours(9, 15, 0, 0);
    } else {
      // Advance days until Monday–Friday
      do {
        target.setDate(target.getDate() + 1);
      } while (target.getDay() === 0 || target.getDay() === 6);
      target.setHours(9, 15, 0, 0);
    }
  }
  const diffMs = target.getTime() - ist.getTime();
  const hrs = Math.max(0, Math.floor(diffMs / 3_600_000));
  const mns = Math.max(0, Math.floor((diffMs % 3_600_000) / 60_000));
  const secs = Math.max(0, Math.floor((diffMs % 60_000) / 1000));
  return {
    isOpen: now ? isOpen : false,
    countdown: now
      ? `${String(hrs).padStart(2, "0")}:${String(mns).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : "--:--:--",
    label: isOpen ? "Closes in" : "Opens in",
  };
}

function LandingPage() {
  const navigate = useNavigate();
  const { acknowledged, accept } = useDisclaimerAcknowledged();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const fetchQuotes = useServerFn(getYahooQuotes);
  const market = useMarketStatus();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchQuotes({ data: { symbols: NIFTY_YAHOO_SYMBOLS } });
        if (!alive || !res.ok) return;
        setQuotes(
          res.quotes.map((q) => ({
            symbol: q.symbol.replace(/\.NS$/i, ""),
            name: q.name,
            price: q.price,
            changePct: q.changePct,
          })),
        );
      } catch {
        // ignore
      }
    };
    load();
    const id = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [fetchQuotes]);

  const trending = useMemo(
    () => [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 8),
    [quotes],
  );
  const topRated = useMemo(
    () => [...quotes].filter((q) => q.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 6),
    [quotes],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return NIFTY_UNIVERSE.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q),
    ).slice(0, 6);
  }, [query]);

  const go = (path: string, search?: Record<string, string>) => {
    if (acknowledged) {
      navigate({ to: path as "/desktop", search: search as never });
    } else {
      setShowDisclaimer(true);
    }
  };

  const runSearch = (raw: string) => {
    const q = raw.trim().toUpperCase();
    if (!q) return;
    const direct = NIFTY_UNIVERSE.find((s) => s.symbol === q);
    const match = direct ?? NIFTY_UNIVERSE.find(
      (s) => s.name.toUpperCase().includes(q) || s.symbol.includes(q),
    );
    const sym = match?.symbol ?? q.replace(/[^A-Z0-9&-]/g, "");
    if (!sym) return;
    setQuery("");
    setShowSuggest(false);
    go("/desktop/charts", { symbol: sym });
  };

  return (
    <div className="min-h-screen bg-hero">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img src={logoAsset.url} alt="InvestIQ logo" className="h-9 w-9 rounded-xl object-contain" />

          <span className="font-display text-xl font-semibold tracking-tight">
            <span className="text-gradient">Invest</span>IQ
          </span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#trending" className="transition hover:text-foreground">Trending</a>
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#trust" className="transition hover:text-foreground">Disclaimer</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-6 text-center md:pt-10">
        <img
          src={logoAsset.url}
          alt="InvestIQ — Invest smarter. Grow better."
          className="mx-auto h-20 w-20 rounded-2xl object-contain"
        />

        <div className="mt-6 flex items-center justify-center gap-3">
          <h1 className="font-display text-5xl font-semibold tracking-tight md:text-6xl">
            <span className="text-gradient">Invest</span>IQ
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            F&amp;O Live
          </span>
        </div>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
          Deep research for Indian stocks.
        </p>

        {/* Feature row */}
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-3 gap-3">
          {[
            { icon: Brain, label: "Analysis" },
            { icon: Zap, label: "Live Prices" },
            { icon: ShieldCheck, label: "Risk Scoring" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* Market status */}
        <div className="mx-auto mt-6 flex max-w-3xl items-center justify-between rounded-xl border border-border bg-surface/60 px-5 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                market.isOpen ? "bg-success animate-pulse" : "bg-destructive"
              }`}
            />
            <span className="font-medium">
              {market.isOpen ? "Market Open" : "Market Closed"}
            </span>
            <span className="text-xs text-muted-foreground">· NSE / BSE · IST</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {market.label}{" "}
            <span className="font-mono text-foreground">{market.countdown}</span>
          </div>
        </div>

        {/* Crypto & Forex banner */}
        <div className="mx-auto mt-3 flex max-w-3xl items-center justify-center gap-6 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 px-5 py-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Bitcoin className="h-3.5 w-3.5 text-primary" /> Crypto Live
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <DollarSign className="h-3.5 w-3.5 text-primary" /> Forex Live
          </span>
          <span className="text-muted-foreground">· 24/7 global coverage</span>
        </div>

        {/* Central search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
          className="relative mx-auto mt-6 max-w-2xl"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggest(true);
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            placeholder="Search any stock — INFY, Reliance, TCS…"
            className="h-14 w-full rounded-2xl border border-border bg-surface/80 pl-12 pr-32 text-base outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            Search
          </button>
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-16 z-40 overflow-hidden rounded-xl border border-border bg-background text-left shadow-elegant">
              {suggestions.map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runSearch(s.symbol);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <span className="font-medium">{s.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {s.name} · {s.sector}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => go("/desktop")}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95"
          >
            Enter research desk
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      {/* Trending Stocks */}
      <section id="trending" className="mx-auto max-w-6xl px-6 pb-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Trending Stocks</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Highest absolute movers from the Nifty universe · live
            </p>
          </div>
          <button
            onClick={() => go("/desktop")}
            className="text-xs text-primary hover:underline"
          >
            View all →
          </button>
        </div>
        {trending.length === 0 ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface/40" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {trending.map((q) => {
              const pos = q.changePct >= 0;
              return (
                <button
                  key={q.symbol}
                  onClick={() => go("/desktop/charts", { symbol: q.symbol })}
                  className="group rounded-xl border border-border bg-surface/60 p-4 text-left transition hover:border-primary/40 hover:bg-surface"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {q.symbol}
                    </span>
                    <TrendingUp
                      className={`h-3.5 w-3.5 transition ${
                        pos ? "text-success" : "-rotate-90 text-destructive"
                      }`}
                    />
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{q.name}</p>
                  <p className="mt-2 font-display text-lg font-semibold">{formatINR(q.price)}</p>
                  <p className={`text-xs font-medium ${pos ? "text-success" : "text-destructive"}`}>
                    {pos ? "+" : ""}
                    {q.changePct.toFixed(2)}%
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Top Rated Stocks */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Top Rated Stocks</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Strongest gainers right now — sorted by 1-day change
            </p>
          </div>
        </div>
        {topRated.length === 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface/40" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {topRated.map((q, i) => (
              <button
                key={q.symbol}
                onClick={() => go("/desktop/charts", { symbol: q.symbol })}
                className="flex items-center justify-between rounded-xl border border-border bg-surface/60 px-4 py-3 text-left transition hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary text-xs font-bold text-primary-foreground">
                    #{i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{q.symbol}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{q.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">{formatINR(q.price)}</p>
                  <p className="text-xs font-medium text-success">+{q.changePct.toFixed(2)}%</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Built for serious market research
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { icon: Brain, title: "AI stock insights", body: "Fundamentals, technicals, and sentiment — synthesized into a decisive BUY/HOLD/SELL view." },
            { icon: BarChart3, title: "Live charts & F&O signals", body: "Real-time Yahoo Finance data with CPR, Camarilla, and pivot-confluence F&O setups." },
            { icon: Sparkles, title: "IPO & Mutual Fund research", body: "Institutional-grade IPO notes, live NAV graphs, and Telegram alerts on every event." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer id="trust" className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-2 px-6 py-8 text-xs text-muted-foreground">
          <p className="text-foreground/80">
            Disclaimer: InvestIQ is NOT a SEBI-registered portal. This is an educational
            research platform only. Please consult a SEBI-registered financial advisor before
            making any investment decisions. All market investments carry risk of loss.
          </p>
          <p>© {new Date().getFullYear()} InvestIQ · Built for education & research purposes.</p>
        </div>
      </footer>

      <DisclaimerModal
        open={showDisclaimer}
        onAccept={() => {
          accept();
          setShowDisclaimer(false);
          navigate({ to: "/desktop" });
        }}
        onCancel={() => setShowDisclaimer(false)}
      />
    </div>
  );
}
