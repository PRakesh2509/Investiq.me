import { ArrowDown, ArrowUp, Shield } from "lucide-react";
import type { WorkstationData } from "./types";

export function SignalBanner({ data, curSymbol }: { data: WorkstationData; curSymbol: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur ${
        data.direction === "CALL"
          ? "border-emerald-500/30 bg-emerald-950/20"
          : "border-rose-500/30 bg-rose-950/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              data.direction === "CALL"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-rose-500/20 text-rose-400"
            }`}
          >
            {data.direction === "CALL" ? (
              <ArrowUp className="h-5 w-5 stroke-[3]" />
            ) : (
              <ArrowDown className="h-5 w-5 stroke-[3]" />
            )}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`font-mono text-sm sm:text-base font-extrabold uppercase tracking-wide ${
                  data.direction === "CALL" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {data.actionText}
              </h3>
              <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                {data.grade}
              </span>
              <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-bold text-primary">
                {data.confidenceScore}% CONFIDENCE
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{data.rationale}</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span>Source: {data.dataSource ?? "market data API"}</span>
        </div>
      </div>

      {/* 6 Key Execution Metrics (Requirements 8, 9, 23) */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            CONTRACT
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-foreground truncate">
            {data.contractName}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            INDEX SPOT ENTRY
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-foreground">
            {data.spotEntry.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            REC. OPTION PREMIUM
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
            {curSymbol}
            {data.recommendedPremium.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            OPTION TP1 (1.5R)
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
            {curSymbol}
            {data.tp1.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            OPTION TP2 (2.5R)
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
            {curSymbol}
            {data.tp2.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            OPTION STOP LOSS
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-rose-400">
            {curSymbol}
            {data.stopLoss.toFixed(2)}
          </p>
        </div>
      </div>
    </section>
  );
}
