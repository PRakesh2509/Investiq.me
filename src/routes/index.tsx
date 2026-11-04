import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BarChart3, Bitcoin, Brain, DollarSign, Search, Sparkles } from "lucide-react";
import { DisclaimerModal, useDisclaimerAcknowledged } from "@/components/DisclaimerModal";
import { ThemeToggle } from "@/components/ThemeToggle";
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

type MarketState = "open" | "pre" | "closed";

// India market hours: pre-open 09:00–09:15, regular 09:15–15:30 IST, Mon–Fri
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
  const preMin = 9 * 60;
  const openMin = 9 * 60 + 15;
  const closeMin = 15 * 60 + 30;
  const isWeekday = day >= 1 && day <= 5;
  const isPre = isWeekday && mins >= preMin && mins < openMin;
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
  const state: MarketState = !now ? "closed" : isOpen ? "open" : isPre ? "pre" : "closed";
  return {
    state,
    isOpen: state === "open",
    countdown:
      now === null
        ? "--:--:--"
        : `${String(hrs).padStart(2, "0")}:${String(mns).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    label: state === "open" ? "Market open" : state === "pre" ? "Pre-open" : "Market closed",
    countdownLabel: state === "open" ? "Closes in" : "Opens in",
  };
}

function deltaClass(changePct: number) {
  if (changePct > 0) return "iq-delta iq-delta--up iq-num";
  if (changePct < 0) return "iq-delta iq-delta--down iq-num";
  return "iq-delta iq-delta--flat iq-num";
}

function deltaText(changePct: number) {
  return `${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`;
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
  const searchRef = useRef<HTMLInputElement>(null);

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

  // "/" jumps to search, Escape dismisses the suggestion list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable === true;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setShowSuggest(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trending = useMemo(
    () => [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 8),
    [quotes],
  );
  const topRated = useMemo(
    () =>
      [...quotes]
        .filter((q) => q.changePct > 0)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 6),
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
    const match =
      direct ??
      NIFTY_UNIVERSE.find((s) => s.name.toUpperCase().includes(q) || s.symbol.includes(q));
    const sym = match?.symbol ?? q.replace(/[^A-Z0-9&-]/g, "");
    if (!sym) return;
    setQuery("");
    setShowSuggest(false);
    go("/desktop/charts", { symbol: sym });
  };

  return (
    <div className="iq-page">
      <a className="iq-sr-only" href="#main">
        Skip to content
      </a>

      <header className="iq-header">
        <div className="iq-container iq-header__bar">
          <a className="iq-logo" href="/" aria-label="InvestIQ home">
            <img src={logoAsset.url} alt="" />
            <span>
              <span className="iq-logo__mark">Invest</span>IQ
            </span>
          </a>
          <nav className="iq-nav" aria-label="Sections">
            <a className="iq-nav__link" href="#trending">
              Trending
            </a>
            <a className="iq-nav__link" href="#top-rated">
              Top rated
            </a>
            <a className="iq-nav__link" href="#features">
              Features
            </a>
            <a className="iq-nav__link" href="#trust">
              Disclaimer
            </a>
            <ThemeToggle className="iq-nav__toggle" />
            <button
              type="button"
              className="iq-btn iq-btn--primary iq-btn--sm"
              onClick={() => go("/desktop")}
            >
              Enter desk
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="iq-hero">
          <div className="iq-container">
            <div className="iq-hero__meta">
              <span className="iq-status" data-state={market.state}>
                <span className="iq-status__dot" aria-hidden="true" />
                <span>{market.label}</span>
                <span className="iq-muted">·</span>
                <span>
                  {market.countdownLabel}{" "}
                  <span className="iq-status__time iq-num">{market.countdown}</span>
                </span>
              </span>
              <ul className="iq-chips">
                <li className="iq-chip iq-chip--live">F&amp;O live</li>
                <li className="iq-chip">NSE / BSE · IST</li>
              </ul>
            </div>

            <div className="iq-hero__copy">
              <p className="iq-eyebrow">Equity research desk</p>
              <h1 className="iq-h1">
                Deep research for <br />
                Indian stocks.
              </h1>
              <p className="iq-lede">
                Fundamentals, technicals and sentiment synthesised into a decisive BUY / HOLD / SELL
                read — with live prices, F&amp;O signals and IPO notes in the same desk.
              </p>
            </div>

            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(query);
              }}
              className="iq-search"
            >
              <Search className="iq-search__icon" aria-hidden="true" />
              <label className="iq-sr-only" htmlFor="iq-search-input">
                Search a stock
              </label>
              <input
                id="iq-search-input"
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggest(true);
                }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                placeholder="Search any stock — INFY, Reliance, TCS…"
                autoComplete="off"
                className="iq-search__input"
              />
              <kbd className="iq-kbd" aria-hidden="true">
                /
              </kbd>
              <button type="submit" className="iq-btn iq-btn--primary iq-search__submit">
                Search
              </button>
              {showSuggest && suggestions.length > 0 && (
                <div className="iq-search__results" role="listbox">
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        runSearch(s.symbol);
                      }}
                      className="iq-search__option"
                    >
                      <span className="iq-symbol">{s.symbol}</span>
                      <span className="iq-muted">
                        {s.name} · {s.sector}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            <div className="iq-hero__actions">
              <button
                type="button"
                className="iq-btn iq-btn--primary"
                onClick={() => go("/desktop")}
              >
                Enter research desk
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <a className="iq-btn iq-btn--ghost" href="#trending">
                See today&apos;s movers
              </a>
            </div>

            <div className="iq-coverage">
              <Bitcoin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Crypto live</span>
              <span aria-hidden="true">·</span>
              <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Forex live</span>
              <span aria-hidden="true">·</span>
              <span>24/7 global coverage</span>
            </div>
          </div>
        </section>

        {/* Trending stocks */}
        <section id="trending" className="iq-section">
          <div className="iq-container">
            <div className="iq-section__head">
              <div>
                <h2 className="iq-h2">Trending today</h2>
                <p className="iq-section__sub">
                  Highest absolute movers from the Nifty universe · refreshes every 15s
                </p>
              </div>
              <button type="button" className="iq-link" onClick={() => go("/desktop")}>
                View all →
              </button>
            </div>

            {trending.length === 0 ? (
              <div className="iq-panel iq-table" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="iq-row iq-row--quote">
                    <span className="iq-skeleton" style={{ height: "0.9rem", width: "55%" }} />
                    <span className="iq-skeleton" style={{ height: "0.9rem", width: "70%" }} />
                    <span className="iq-skeleton" style={{ height: "0.9rem", width: "80%" }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="iq-panel iq-table">
                <div className="iq-row iq-row--quote iq-row--head" aria-hidden="true">
                  <span>Company</span>
                  <span className="iq-row__price">Last</span>
                  <span className="iq-row__change">1D</span>
                </div>
                {trending.map((q) => (
                  <button
                    key={q.symbol}
                    type="button"
                    onClick={() => go("/desktop/charts", { symbol: q.symbol })}
                    className="iq-row iq-row--quote"
                  >
                    <span>
                      <span className="iq-symbol">{q.symbol}</span>
                      <span className="iq-symbol__name">{q.name}</span>
                    </span>
                    <span className="iq-row__price iq-num">{formatINR(q.price)}</span>
                    <span className={deltaClass(q.changePct)}>{deltaText(q.changePct)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Top rated */}
        <section id="top-rated" className="iq-section">
          <div className="iq-container">
            <div className="iq-section__head">
              <div>
                <h2 className="iq-h2">Top rated</h2>
                <p className="iq-section__sub">
                  Strongest gainers right now — ranked by 1-day change
                </p>
              </div>
            </div>

            {topRated.length === 0 ? (
              <div className="iq-panel iq-table" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="iq-row iq-row--quote">
                    <span className="iq-skeleton" style={{ height: "0.9rem", width: "55%" }} />
                    <span className="iq-skeleton" style={{ height: "0.9rem", width: "70%" }} />
                    <span className="iq-skeleton" style={{ height: "0.9rem", width: "80%" }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="iq-panel iq-table">
                <div className="iq-row iq-row--quote iq-row--head" aria-hidden="true">
                  <span>Company</span>
                  <span className="iq-row__price">Last</span>
                  <span className="iq-row__change">1D</span>
                </div>
                {topRated.map((q, i) => (
                  <button
                    key={q.symbol}
                    type="button"
                    onClick={() => go("/desktop/charts", { symbol: q.symbol })}
                    className="iq-row iq-row--quote"
                  >
                    <span className="iq-row__lead">
                      <span className="iq-rank iq-num">{String(i + 1).padStart(2, "0")}</span>
                      <span>
                        <span className="iq-symbol">{q.symbol}</span>
                        <span className="iq-symbol__name">{q.name}</span>
                      </span>
                    </span>
                    <span className="iq-row__price iq-num">{formatINR(q.price)}</span>
                    <span className={deltaClass(q.changePct)}>{deltaText(q.changePct)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="iq-section">
          <div className="iq-container">
            <div className="iq-section__head">
              <div>
                <h2 className="iq-h2">Built for serious market research</h2>
                <p className="iq-section__sub">
                  Three desks, one method — evidence first, opinions last.
                </p>
              </div>
              <a className="iq-link" href="#trust">
                How we disclose →
              </a>
            </div>

            <div className="iq-features">
              {[
                {
                  icon: Brain,
                  title: "AI stock insights",
                  body: "Fundamentals, technicals and sentiment synthesised into a decisive BUY / HOLD / SELL view — with the reasoning shown, not hidden.",
                  lead: true,
                },
                {
                  icon: BarChart3,
                  title: "Live charts & F&O signals",
                  body: "Real-time Yahoo Finance data with CPR, Camarilla and pivot-confluence F&O setups.",
                  lead: false,
                },
                {
                  icon: Sparkles,
                  title: "IPO & mutual fund research",
                  body: "Institutional-grade IPO notes, live NAV graphs and Telegram alerts on every event.",
                  lead: false,
                },
              ].map(({ icon: Icon, title, body, lead }) => (
                <article
                  key={title}
                  className={`iq-panel iq-feature${lead ? " iq-feature--lead" : ""}`}
                >
                  <span className="iq-feature__icon">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="iq-h3">{title}</h3>
                  <p className="iq-feature__text">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Disclosure */}
        <section className="iq-section">
          <div className="iq-container">
            <p className="iq-notice">
              <strong>InvestIQ is not a SEBI-registered portal.</strong> This is an educational
              research platform only. Consult a SEBI-registered financial advisor before making
              investment decisions — all market investments carry risk of loss.
            </p>
          </div>
        </section>
      </main>

      <footer id="trust" className="iq-footer">
        <div className="iq-container iq-footer__inner">
          <div>
            <a className="iq-logo" href="/">
              <img src={logoAsset.url} alt="" />
              <span>
                <span className="iq-logo__mark">Invest</span>IQ
              </span>
            </a>
            <div className="iq-footer__meta">
              <span>Deep research for Indian stocks · NSE / BSE · IST</span>
              <span>© {new Date().getFullYear()} InvestIQ · Education &amp; research only</span>
            </div>
          </div>
          <nav className="iq-nav" aria-label="Footer">
            <a className="iq-nav__link" href="#trending">
              Trending
            </a>
            <a className="iq-nav__link" href="#top-rated">
              Top rated
            </a>
            <a className="iq-nav__link" href="#features">
              Features
            </a>
            <button type="button" className="iq-link" onClick={() => go("/desktop")}>
              Enter desk →
            </button>
          </nav>
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
