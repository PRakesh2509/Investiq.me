import { Award, BarChart3 } from "lucide-react";
import { DataQualityBadges } from "@/components/DataQualityBadges";
import type { WorkstationData } from "./types";

export function SignalHistory({
  data,
  onOpenBacktest,
  backtestReady,
}: {
  data: WorkstationData;
  onOpenBacktest: () => void;
  backtestReady: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur text-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
            RECENT CONFLUENCE SIGNALS &amp; STRATEGY PERFORMANCE
          </h3>
          <DataQualityBadges flags={data} />
        </div>
        {/* Backtest & Win Rate Summary (Requirements 44, 46, 47) */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <button
            onClick={onOpenBacktest}
            disabled={!backtestReady}
            title={backtestReady ? undefined : "Backtest report is still loading"}
            className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Award className="h-3.5 w-3.5" />
            <span>4-MODEL ALPHA BENCHMARK (PHASE 10)</span>
          </button>
          <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-400">
            Win Rate{data.isSimulated ? " (simulated)" : ""}: {data.winRatePct}%
          </span>
          <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 font-bold text-primary">
            Profit Factor{data.isSimulated ? " (simulated)" : ""}: {data.profitFactor}
          </span>
          <span className="text-muted-foreground">
            Showing last 6 of {data.totalSignalsTracked} signals
          </span>
        </div>
      </div>

      {/* 6 Historical Signal Cards (Requirements 41-44) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(data.recentSignals ?? []).length === 0 && (
          <p className="col-span-full rounded-xl border border-border bg-background/50 p-6 text-center font-mono text-muted-foreground">
            No recent signals available for {data.instrument}.
          </p>
        )}
        {(data.recentSignals ?? []).map((sig) => {
          const isPe = sig.type.includes("PE");
          return (
            <div
              key={sig.id}
              className="rounded-xl border border-border bg-background/50 p-3 font-mono space-y-2 hover:border-primary/50 transition shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-extrabold ${
                    isPe
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  }`}
                >
                  {sig.type} {isPe ? "▼" : "▲"}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      sig.status === "TARGET HIT"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/20 text-rose-400"
                    }`}
                  >
                    {sig.status} ({sig.pnlPoints >= 0 ? "+" : ""}
                    {sig.pnlPoints.toFixed(1)} pts)
                  </span>
                  <span className="text-[10px] text-muted-foreground">{sig.timeStr}</span>
                </div>
              </div>

              <div>
                <p className="font-bold text-foreground text-sm">Spot @ {sig.spot.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sig.rationale}</p>
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[10px]">
                <span className="text-emerald-400 font-semibold">
                  TARGET: {sig.target.toFixed(2)}
                </span>
                <span className="text-rose-400 font-semibold">STOP: {sig.stop.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
