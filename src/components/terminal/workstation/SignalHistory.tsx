import { BarChart3 } from "lucide-react";
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
  const isDelayed = data.freshnessStatus === "DELAYED";

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur text-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
            RECENT CONFLUENCE SIGNALS &amp; STRATEGY PERFORMANCE
          </h3>
          <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
            Source: Dhan · Live Feeds
          </span>
          {isDelayed && (
            <span className="rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400">
              DELAYED (~15s behind)
            </span>
          )}
        </div>

        {/* Real Backtest & Win Rate Summary */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-400">
            Win Rate: {data.winRateText}
          </span>
          <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 font-bold text-primary">
            Profit Factor: {data.profitFactorText}
          </span>
          <span className="text-muted-foreground">
            Showing last {Math.min(6, (data.recentSignals ?? []).length)} of {data.totalSignalsTracked} signals
          </span>
        </div>
      </div>

      {/* 6 Real Historical Signal Cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(data.recentSignals ?? []).length === 0 && (
          <p className="col-span-full rounded-xl border border-border bg-background/50 p-6 text-center font-mono text-muted-foreground">
            No closed signals yet for {data.instrument}.
          </p>
        )}
        {(data.recentSignals ?? []).map((sig) => {
          const isPe = sig.type.includes("PE");
          const isTargetHit = sig.status === "TARGET HIT";
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
                      isTargetHit
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
                <p className="font-bold text-foreground text-xs">{sig.contract}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sig.rationale}</p>
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[10px]">
                <span className="text-muted-foreground">
                  Entry: ₹{sig.entryPrice.toFixed(2)}
                </span>
                <span className="text-emerald-400 font-semibold">
                  TP1: ₹{sig.target.toFixed(2)}
                </span>
                <span className="text-rose-400 font-semibold">
                  SL: ₹{sig.stop.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
