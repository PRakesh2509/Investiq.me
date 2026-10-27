import { Sparkles } from "lucide-react";
import type { IpoScoringFactors } from "@/lib/ipos";

export function FactorBreakdown({
  aiScore,
  factors,
}: {
  aiScore: number;
  factors: IpoScoringFactors;
}) {
  return (
    <>
      <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            5-Factor Institutional Score Breakdown
          </h3>
          <span className="text-xs text-muted-foreground">Weighted Composite: {aiScore}/100</span>
        </div>

        <div className="space-y-3 pt-2 text-xs">
          {[
            {
              key: "demand",
              name: "A. Subscription Demand",
              weightLabel: "30%",
              ...factors.demand,
            },
            {
              key: "financials",
              name: "B. Financial Quality",
              weightLabel: "25%",
              ...factors.financials,
            },
            {
              key: "valuation",
              name: "C. Valuation & Peer Pricing",
              weightLabel: "20%",
              ...factors.valuation,
            },
            {
              key: "gmp",
              name: "D. GMP & Grey Market Sentiment",
              weightLabel: "15%",
              ...factors.gmp,
            },
            {
              key: "structure",
              name: "E. Issue Structure & Capital Use",
              weightLabel: "10%",
              ...factors.structure,
            },
          ].map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {f.name}{" "}
                  <span className="text-[10px] text-muted-foreground">({f.weightLabel})</span>
                </span>
                <span className="font-bold">{f.score}/100</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-background overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    f.score >= 75 ? "bg-emerald-400" : f.score >= 55 ? "bg-amber-400" : "bg-red-400"
                  }`}
                  style={{ width: `${f.score}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{f.rationale}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
