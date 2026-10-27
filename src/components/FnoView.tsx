import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getFnoSignals } from "@/lib/fno-engine.functions";
import type { Signal } from "@/lib/fno-engine";
import { SkeletonCard } from "@/components/Skeleton";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

const fmt = (n: number, cur: string) =>
  cur === "INR"
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

export default function FnoView({
  market,
  title,
  currency,
}: {
  market: "india" | "usa";
  title: string;
  currency: string;
}) {
  const fetchFn = useServerFn(getFnoSignals);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchFn({ data: { market } });
      if (r.ok) {
        setSignals(r.signals);
        setTs(r.generatedAt);
        setError(null);
      } else {
        setError("Signals are unavailable right now.");
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Failed to load signals.");
    } finally {
      setLoading(false);
    }
  }, [fetchFn, market]);

  useEffect(() => {
    void load();
  }, [load]);

  const gradeColor = (g: string) =>
    g === "A+"
      ? "bg-success/15 text-success border-success/40"
      : g === "A"
        ? "bg-primary/15 text-primary border-primary/40"
        : "bg-muted/40 text-muted-foreground border-border";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Index F&amp;O only · Pivots + CPR + Camarilla confluence · Educational, not advice
          </p>
          {ts > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Generated {new Date(ts).toLocaleString("en-IN")}
            </p>
          )}
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

      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-200">
        ⚠️ F&O carries high risk. Confidence % is derived from confluence hits and a bounded
        backtest window — <span className="font-semibold">not a promise of accuracy</span>. Use
        position sizing and a stop-loss.
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
          {signals.length > 0 ? " Showing the last loaded signals." : ""}
        </div>
      )}

      {loading && signals.length === 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : signals.length === 0 && !error ? (
        <div className="rounded-2xl border border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          No high-confluence setups right now. Come back near the next session.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {signals.map((s) => {
            const isLong = s.direction === "LONG";
            return (
              <div key={s.symbol} className="rounded-2xl border border-border bg-surface/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {s.symbol}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-semibold">{s.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${gradeColor(s.grade)}`}
                    >
                      {s.grade}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        isLong
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-destructive/40 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {isLong ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {s.direction}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
                  <Stat label="LTP" value={fmt(s.ltp, currency)} />
                  <Stat label="Entry" value={fmt(s.entry, currency)} accent="primary" />
                  <Stat label="Target" value={fmt(s.target, currency)} accent="success" />
                  <Stat label="Stop" value={fmt(s.stop, currency)} accent="destructive" />
                </div>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">R:R </span>
                    <span className="font-semibold">1:{s.rr.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence </span>
                    <span className="font-semibold">{s.confidence}%</span>
                  </div>
                  <div className="text-muted-foreground">{s.timeframe}</div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-gradient-primary"
                    style={{ width: `${s.confidence}%` }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.confluences.map((c) => (
                    <span
                      key={c}
                      className="rounded-md bg-accent/40 px-2 py-0.5 text-[10px] text-foreground/80"
                    >
                      {c}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-xs text-muted-foreground">{s.note}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "destructive" | "primary";
}) {
  const color =
    accent === "success"
      ? "text-success"
      : accent === "destructive"
        ? "text-destructive"
        : accent === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold ${color}`}>{value}</p>
    </div>
  );
}
