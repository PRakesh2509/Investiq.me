import { ArrowDown, ArrowUp, AlertCircle, Shield, CheckCircle2, XCircle } from "lucide-react";
import type { WorkstationData } from "./types";

export function SignalBanner({ data, curSymbol }: { data: WorkstationData; curSymbol: string }) {
  const isNoTrade = data.direction === "NO TRADE";
  const isCall = data.direction === "BUY CALL" || data.direction === "SELL PUT";

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur ${
        isNoTrade
          ? "border-amber-500/30 bg-amber-950/20"
          : isCall
            ? "border-emerald-500/30 bg-emerald-950/20"
            : "border-rose-500/30 bg-rose-950/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              isNoTrade
                ? "bg-amber-500/20 text-amber-400"
                : isCall
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/20 text-rose-400"
            }`}
          >
            {isNoTrade ? (
              <AlertCircle className="h-5 w-5 stroke-[2.5]" />
            ) : isCall ? (
              <ArrowUp className="h-5 w-5 stroke-[3]" />
            ) : (
              <ArrowDown className="h-5 w-5 stroke-[3]" />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={`font-mono text-sm sm:text-base font-extrabold uppercase tracking-wide ${
                  isNoTrade ? "text-amber-400" : isCall ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {data.actionText}
              </h3>
              {!isNoTrade && (
                <>
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    {data.grade}
                  </span>
                  <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {data.confidenceScore}% CONFIDENCE
                  </span>
                </>
              )}
              {isNoTrade && (
                <span className="rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  DISCIPLINE FILTER ACTIVE
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{data.rationale}</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span>Source: {data.dataSource ?? "Dhan · Live Feed"}</span>
        </div>
      </div>

      {/* 6 Key Execution Metrics */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            CONTRACT
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-foreground truncate">
            {data.contractName || "—"}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            INDEX SPOT ENTRY
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-foreground">
            {data.spotEntry > 0 ? data.spotEntry.toFixed(2) : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            REC. OPTION PREMIUM
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
            {data.recommendedPremium > 0
              ? `${curSymbol}${data.recommendedPremium.toFixed(2)}`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            OPTION TP1 (1.5R)
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
            {data.tp1 > 0 ? `${curSymbol}${data.tp1.toFixed(2)}` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            OPTION TP2 (2.5R)
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
            {data.tp2 > 0 ? `${curSymbol}${data.tp2.toFixed(2)}` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            STOP LOSS (-20%)
          </p>
          <p className="mt-0.5 font-mono text-xs font-bold text-rose-400">
            {data.stopLoss > 0 ? `${curSymbol}${data.stopLoss.toFixed(2)}` : "—"}
          </p>
        </div>
      </div>

      {/* Confluences Gates Strip & News Influence */}
      {data.confluences && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-[10px] font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-muted-foreground">CONFLUENCE GATES:</span>
            <span
              className={`inline-flex items-center gap-0.5 ${
                data.confluences.structure ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              STR:{data.confluences.structure ? "✓" : "✗"}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 ${
                data.confluences.momentum ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              MOM:{data.confluences.momentum ? "✓" : "✗"}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 ${
                data.confluences.volume ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              VOL:{data.confluences.volume ? "✓" : "✗"}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 ${
                data.confluences.trend ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              TRD:{data.confluences.trend ? "✓" : "✗"}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 ${
                data.confluences.vix ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              VIX:{data.confluences.vix ? "✓" : "✗"}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 ${
                data.confluences.timing ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              TIM:{data.confluences.timing ? "✓" : "✗"}
            </span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
              ({data.confluences.passedCount}/{data.confluences.totalCount} Gates)
            </span>
          </div>

          <div className="text-muted-foreground text-[10px]">
            {data.influencingNews && data.influencingNews.length > 0 && (
              <span>Macro Backdrop: {data.influencingNews[0]}</span>
            )}
          </div>
        </div>
      )}

      {/* Educational Disclaimer (Section 13.10) */}
      <p className="mt-2 text-[10px] text-muted-foreground text-center">
        {data.disclaimer}
      </p>
    </section>
  );
}
