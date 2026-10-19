import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, LineChart, Bell, Search, CalendarClock, Wallet, CandlestickChart, PanelLeftClose, PanelLeftOpen, Calculator } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAdmin } from "@/context/AdminContext";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";
import { toast } from "sonner";
import AvgPriceCalculator from "@/components/AvgPriceCalculator";
const logoAsset = { url: "/investiq-logo.png" };


export const Route = createFileRoute("/desktop")({
  component: DesktopLayout,
});

const nav = [
  { to: "/desktop", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/desktop/charts", label: "Stocks", icon: LineChart },
  { to: "/desktop/terminal", label: "Terminal", icon: CandlestickChart },
  
  { to: "/desktop/funds", label: "Mutual Funds", icon: Wallet },
  { to: "/desktop/ipos", label: "IPO Tracker", icon: CalendarClock },
];



function resolveSearch(input: string): string | null {
  const q = input.trim().toUpperCase();
  if (!q) return null;
  const direct = NIFTY_UNIVERSE.find((s) => s.symbol === q);
  if (direct) return direct.symbol;
  const byName = NIFTY_UNIVERSE.find((s) => s.name.toUpperCase() === q);
  if (byName) return byName.symbol;
  const loose = NIFTY_UNIVERSE.find(
    (s) => s.name.toUpperCase().includes(q) || s.symbol.includes(q),
  );
  if (loose) return loose.symbol;
  // Fallback: treat raw input as Yahoo NSE symbol
  return q.replace(/\.NS$/, "").replace(/[^A-Z0-9&-]/g, "") || null;
}

function DesktopLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { isAdmin, login } = useAdmin();
  const clicks = useRef<number[]>([]);
  const [modal, setModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return NIFTY_UNIVERSE.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q),
    ).slice(0, 8);
  }, [query]);
  const [showSuggest, setShowSuggest] = useState(false);

  const runSearch = (raw: string) => {
    const sym = resolveSearch(raw);
    if (!sym) {
      toast.error("Enter a stock name or NSE ticker");
      return;
    }
    setQuery("");
    setShowSuggest(false);
    navigate({ to: "/desktop/charts", search: { symbol: sym } });
  };

  const handleFooterClick = () => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 800), now];
    if (clicks.current.length >= 3) {
      clicks.current = [];
      if (isAdmin) navigate({ to: "/desktop/admin" });
      else setModal(true);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(u, p)) {
      toast.success("Admin authenticated");
      setModal(false);
      setU(""); setP("");
      navigate({ to: "/desktop/admin" });
    } else {
      toast.error("Invalid credentials");
    }
  };

  if (loc.pathname === "/desktop/terminal" || loc.pathname === "/desktop/fno-india") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-hero text-foreground">
      {/* Top header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-6 backdrop-blur">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface/60 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <Link to="/" className="flex items-center gap-3 transition hover:opacity-80" title="Back to home">
          <img
            src={logoAsset.url}
            alt="InvestIQ logo"
            className="h-9 w-9 rounded-xl object-contain"
          />

          <span className="font-display text-lg font-semibold">
            <span className="text-gradient">Invest</span>IQ
            <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">F&amp;O Live</span>
          </span>
        </Link>
        <div className="flex flex-1 items-center justify-center px-8">
          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(query); }}
            className="relative w-full max-w-md"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="Search stocks (e.g. INFY, Reliance, TCS)"
              className="h-10 w-full rounded-lg border border-border bg-surface/60 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-lg border border-border bg-background shadow-elegant">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); runSearch(s.symbol); }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{s.symbol}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.name} · {s.sector}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCalcOpen(true)}
            title="Avg Price Calculator"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Avg Calc</span>
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface/60 hover:bg-accent">
            <Bell className="h-4 w-4" />
          </button>
          <Link
            to="/"
            className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium hover:bg-accent"
          >
            Exit
          </Link>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden border-r border-border bg-sidebar py-6 transition-all duration-300 ${
            sidebarOpen ? "w-[250px] px-4" : "w-[72px] px-3"
          }`}
        >
          <nav className="flex flex-col gap-1">
            {nav.map((n) => {
              const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to as "/desktop"}
                  title={n.label}
                  className={`flex items-center gap-3 rounded-lg py-2.5 text-sm transition ${
                    sidebarOpen ? "px-3" : "justify-center px-0"
                  } ${
                    active
                      ? "bg-gradient-primary text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {sidebarOpen && <span className="truncate">{n.label}</span>}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                to="/desktop/admin"
                title="Admin Panel"
                className={`mt-2 flex items-center gap-3 rounded-lg py-2.5 text-sm transition ${
                  sidebarOpen ? "px-3" : "justify-center px-0"
                } ${
                  loc.pathname.startsWith("/desktop/admin")
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="truncate">Admin Panel</span>}
              </Link>
            )}
          </nav>
          {sidebarOpen && (
            <div className="mt-8 rounded-xl border border-border bg-surface/60 p-4 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Market status</p>
              <p>NSE / BSE — Open</p>
              <p className="mt-2">Session ends 3:30 PM IST</p>
            </div>
          )}
        </aside>


        {/* Main */}
        <main className="min-w-0 flex-1 px-8 py-8">
          <Outlet />
          <div
            onClick={handleFooterClick}
            className="mt-16 cursor-default select-none border-t border-border pt-4"
            title=""
          >
            <div className="iq-ticker text-[11px] text-muted-foreground">
              <div className="iq-ticker-track">
                {Array.from({ length: 2 }).map((_, k) => (
                  <span key={k} className="inline-flex gap-12 whitespace-nowrap">
                    <span>⚠ Investments are subject to market risk. Read all scheme related documents carefully.</span>
                    <span>InvestIQ is not a SEBI-registered investment advisor.</span>
                    <span>Past performance is not indicative of future returns.</span>
                    <span>© 2026 InvestIQ · For research & educational use only.</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur">
          <form
            onSubmit={submit}
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-elegant"
          >
            <h2 className="font-display text-lg font-semibold">Admin access</h2>
            <p className="mt-1 text-xs text-muted-foreground">Enter your admin credentials</p>
            <label className="mt-4 block text-xs font-medium">Username</label>
            <input
              autoFocus
              value={u}
              onChange={(e) => setU(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
            <label className="mt-3 block text-xs font-medium">Password</label>
            <input
              type="password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
              >
                Sign in
              </button>
            </div>
          </form>
        </div>
      )}

      <AvgPriceCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />
    </div>
  );
}
