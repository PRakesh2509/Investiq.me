import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";
import { getYahooQuotes } from "@/lib/yahoo.functions";
import { formatINR } from "@/lib/market-data";
import { PremiumLoader } from "@/components/PremiumLoader";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/desktop/sector/$name")({
  component: SectorPage,
});

type Q = { symbol: string; name: string; price: number; changePct: number; volume: number };

function SectorPage() {
  const { name } = Route.useParams();
  const sector = decodeURIComponent(name);
  const fetchQuotes = useServerFn(getYahooQuotes);
  const [quotes, setQuotes] = useState<Q[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(
    () => NIFTY_UNIVERSE.filter((s) => s.sector.toLowerCase() === sector.toLowerCase()),
    [sector],
  );

  const load = async () => {
    if (members.length === 0) return;
    setLoading(true);
    try {
      const symbols = members.map((m) => `${m.symbol}.NS`).join(",");
      const res = await fetchQuotes({ data: { symbols } });
      if (res.ok) {
        setQuotes(
          res.quotes.map((q) => ({
            symbol: q.symbol.replace(/\.NS$/i, ""),
            name: q.name,
            price: q.price,
            changePct: q.changePct,
            volume: q.volume,
          })),
        );
        setError(null);
      } else {
        setError("Live quotes are unavailable right now.");
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Failed to load quotes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

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
        .filter((q) => q.changePct <= 0)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 5),
    [quotes],
  );
  const avgPct = quotes.length ? quotes.reduce((s, q) => s + q.changePct, 0) / quotes.length : 0;
  const pos = avgPct >= 0;
  const advances = quotes.filter((q) => q.changePct > 0).length;
  const declines = quotes.filter((q) => q.changePct < 0).length;
  const totalAdvDec = advances + declines;
  const upPct = totalAdvDec > 0 ? (advances / totalAdvDec) * 100 : 50;
  const downPct = 100 - upPct;

  if (members.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No tracked stocks found for the "{sector}" sector.
      </div>
    );
  }

  if (quotes.length === 0 && error) {
    return (
      <div role="alert" className="space-y-3 py-16 text-center text-sm text-destructive">
        <p>{error}</p>
        <button
          onClick={() => void load()}
          className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold hover:bg-destructive/10"
        >
          Retry
        </button>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="py-16">
        <PremiumLoader label={`Loading ${sector} stocks`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link
            to="/desktop"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Research Desk
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold">{sector}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} tracked stocks · avg{" "}
            <span className={pos ? "text-success" : "text-destructive"}>
              {pos ? "+" : ""}
              {avgPct.toFixed(2)}%
            </span>{" "}
            · auto-refresh 10s
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Advance / Decline Split Bar matching UI/UX */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface/60 p-4">
        <div>
          <h3 className="font-display text-sm font-semibold">Advance / Decline Ratio</h3>
          <p className="text-xs text-muted-foreground">Market breadth across {quotes.length} {sector} stocks</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
            {advances}
          </span>
          <div className="w-32 sm:w-56 md:w-72 h-2.5 rounded-full overflow-hidden flex bg-muted/40 shrink-0">
            {totalAdvDec === 0 ? (
              <div className="h-full w-full bg-muted/30" />
            ) : (
              <>
                {advances > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${declines === 0 ? 100 : upPct}%` }}
                  />
                )}
                {declines > 0 && (
                  <div
                    className="h-full bg-rose-500 transition-all duration-300"
                    style={{ width: `${advances === 0 ? 100 : downPct}%` }}
                  />
                )}
              </>
            )}
          </div>
          <span className="font-mono text-sm font-bold text-rose-400 tabular-nums">
            {declines}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StockList title="Gainers" rows={gainers} up />
        <StockList title="Losers" rows={losers} />
      </div>
    </div>
  );
}

function StockList({ title, rows, up }: { title: string; rows: Q[]; up?: boolean }) {
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
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Waiting for live data…</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.symbol}>
              <Link
                to="/desktop/charts"
                search={{ symbol: s.symbol }}
                className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 transition hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium">{s.symbol}</p>
                  <p className="text-[11px] text-muted-foreground">{s.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{formatINR(s.price)}</p>
                  <p
                    className={`text-xs ${s.changePct >= 0 ? "text-success" : "text-destructive"}`}
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
