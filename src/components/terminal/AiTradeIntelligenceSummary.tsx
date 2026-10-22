import { useState } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  Clock,
  AlertTriangle,
  Layers,
} from "lucide-react";
import type { TradeScoringResult } from "@/lib/trade-scoring-service";

interface AiTradeIntelligenceSummaryProps {
  scoreData?: TradeScoringResult | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export default function AiTradeIntelligenceSummary({
  scoreData,
  isLoading,
  onRefresh,
}: AiTradeIntelligenceSummaryProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  if (!scoreData) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-4 shadow-md backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary animate-pulse" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Synthesizing AI Confluence Intelligence...
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">Calibrating 7 Quantitative Factors</span>
        </div>
      </div>
    );
  }

  const {
    overallScore,
    marketBias,
    confidenceLevel,
    dataQuality,
    explanation,
    supportingBullishFactors,
    supportingBearishFactors,
    marketRisks,
    factorBreakdown,
    riskChecks,
    allHardRiskPassed,
    evaluationTimestamp,
    scoringVersion,
  } = scoreData;

  const biasColor =
    marketBias === "BULLISH"
      ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/40"
      : marketBias === "BEARISH"
      ? "text-rose-400 bg-rose-500/15 border-rose-500/40"
      : "text-amber-400 bg-amber-500/15 border-amber-500/40";

  const scoreColor =
    overallScore >= 70
      ? "text-emerald-400"
      : overallScore >= 50
      ? "text-amber-400"
      : "text-rose-400";

  const qualityBadge =
    dataQuality === "LIVE_VERIFIED"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : dataQuality === "PARTIAL_INPUTS"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
      : "bg-rose-500/10 text-rose-400 border-rose-500/30";

  const formattedTime = new Date(evaluationTimestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-surface/90 via-surface/75 to-surface/90 p-4 shadow-xl backdrop-blur">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30 shadow-inner">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-extrabold uppercase tracking-wide text-foreground flex items-center gap-1.5">
                AI Trade Intelligence Summary
                <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.2 text-[9px] font-semibold text-primary">
                  7-FACTOR ENGINE
                </span>
              </h3>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${biasColor}`}>
                {marketBias === "BULLISH" && <TrendingUp className="inline h-3 w-3 mr-1" />}
                {marketBias === "BEARISH" && <TrendingDown className="inline h-3 w-3 mr-1" />}
                {marketBias === "NEUTRAL" && <Minus className="inline h-3 w-3 mr-1" />}
                BIAS: {marketBias}
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              Multi-dimensional confluence of technicals, Black-Scholes Greeks, IV regime, PCR positioning &amp; verified macro events.
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${qualityBadge}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            {dataQuality.replace("_", " ")}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground bg-background/50 border border-border px-2 py-0.5 rounded-md">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {formattedTime} IST
          </span>
        </div>
      </div>

      {/* Main Metric Cards Grid */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
        {/* Score Card (3 Cols) */}
        <div className="sm:col-span-1 lg:col-span-3 rounded-xl border border-border bg-background/60 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
              AI TRADE SCORE
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">MAX 100</span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className={`font-mono text-3xl font-black tracking-tight ${scoreColor}`}>
              {overallScore}
            </span>
            <span className="font-mono text-xs text-muted-foreground font-semibold">/ 100</span>
          </div>
          <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-border/50">
            <div
              className={`h-full transition-all duration-700 ${
                overallScore >= 70 ? "bg-emerald-500" : overallScore >= 50 ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{ width: `${overallScore}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground mt-1.5">
            Calibrated against institutional out-of-sample models.
          </span>
        </div>

        {/* Confidence & Hard Risk Status (3 Cols) */}
        <div className="sm:col-span-1 lg:col-span-3 rounded-xl border border-border bg-background/60 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
              CALIBRATED CONFIDENCE
            </span>
            <span className="text-[10px] font-mono text-primary font-bold">{confidenceLevel}%</span>
          </div>
          <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-border/50 my-1">
            <div
              className="h-full bg-primary transition-all duration-700"
              style={{ width: `${confidenceLevel}%` }}
            />
          </div>

          <div className="mt-2 border-t border-border/60 pt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">HARD RISK GATE</span>
            <span
              className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                allHardRiskPassed
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              {allHardRiskPassed ? (
                <>
                  <ShieldCheck className="h-3 w-3" /> ALL PASSED
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3 w-3" /> RISK RESTRICTION
                </>
              )}
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground mt-1">
            {allHardRiskPassed
              ? "All execution filters & gamma limits satisfied."
              : "Active warning: Expiry decay or spread friction detected."}
          </span>
        </div>

        {/* Concise Explanation & Drivers (6 Cols) */}
        <div className="sm:col-span-2 lg:col-span-6 rounded-xl border border-border bg-background/60 p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                CONFLUENCE RATIONALE
              </span>
              <span className="text-[9px] font-mono text-muted-foreground">{scoringVersion}</span>
            </div>
            <p className="mt-1 font-mono text-xs text-foreground/90 leading-relaxed">
              {explanation}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="bg-surface/70 rounded p-1.5 border border-border/50">
              <span className="text-emerald-400 font-bold block mb-0.5">▲ BULLISH DRIVERS ({supportingBullishFactors.length})</span>
              <p className="text-muted-foreground line-clamp-2">{supportingBullishFactors[0]}</p>
            </div>
            <div className="bg-surface/70 rounded p-1.5 border border-border/50">
              <span className="text-rose-400 font-bold block mb-0.5">▼ BEARISH HEADWINDS ({supportingBearishFactors.length})</span>
              <p className="text-muted-foreground line-clamp-2">{supportingBearishFactors[0]}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expand/Collapse Toggle for Factor Breakdown & Hard Risk Checks */}
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary hover:text-primary/80 transition"
        >
          <Layers className="h-3.5 w-3.5" />
          {isExpanded ? "Hide Factor Breakdown & Risk Gates" : "Inspect 7-Factor Weights & Hard Risk Gates"}
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <span className="text-[10px] font-mono text-muted-foreground">
          Score is an algorithmic confluence rating · Not a guaranteed probability of profit
        </span>
      </div>

      {/* Expanded Factor Table and Risk Gates Drawer */}
      {isExpanded && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3 text-xs font-mono">
          {/* Factor Breakdown Table */}
          <div className="rounded-xl border border-border bg-background/50 overflow-hidden">
            <div className="p-2.5 bg-surface/80 border-b border-border flex items-center justify-between">
              <span className="font-bold text-foreground text-[11px] uppercase tracking-wider">
                7-Factor Weighted Attribution Model
              </span>
              <span className="text-[10px] text-muted-foreground">
                Weights calibrate periodically from historical forward tests
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-border text-[9px] uppercase tracking-wider text-muted-foreground bg-surface/40">
                    <th className="py-2 px-3">FACTOR</th>
                    <th className="py-2 px-2 text-center">WEIGHT</th>
                    <th className="py-2 px-2 text-center">RAW SCORE</th>
                    <th className="py-2 px-2 text-center">CONTRIBUTION</th>
                    <th className="py-2 px-3">EVIDENCE &amp; OBSERVATION</th>
                    <th className="py-2 px-2 text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {factorBreakdown.map((f) => (
                    <tr key={f.id} className="hover:bg-accent/20 transition">
                      <td className="py-2 px-3 font-semibold text-foreground">{f.name}</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">
                        {(f.weight * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-2 text-center font-bold">
                        <span
                          className={
                            f.score >= 65 ? "text-emerald-400" : f.score <= 40 ? "text-rose-400" : "text-amber-400"
                          }
                        >
                          {f.score}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-primary">
                        +{f.weightedContribution.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-[10px]">
                        <span className="text-foreground/90 font-medium">{f.evidence}</span>
                        <span className="block text-muted-foreground/80 mt-0.5">{f.rationale}</span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            f.status === "OPTIMAL"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : f.status === "STALE"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}
                        >
                          {f.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hard Risk Checks Card */}
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-border">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <span className="font-bold text-foreground text-[11px] uppercase tracking-wider">
                Independent Hard Risk Gates (Safety Protocol)
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                Hard safety rules can veto execution regardless of score
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {riskChecks.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-lg border p-2.5 ${
                    r.passed
                      ? "border-emerald-500/30 bg-emerald-950/15"
                      : "border-rose-500/40 bg-rose-950/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-foreground text-[10px]">{r.name}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        r.passed ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      }`}
                    >
                      {r.passed ? "PASSED" : r.severity}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{r.rule}</p>
                  <div className="mt-1.5 pt-1 border-t border-border/40 text-[9px]">
                    <span className="text-foreground/80 block font-semibold">Observed: {r.observedValue}</span>
                    <span className="text-muted-foreground block mt-0.5">{r.mitigation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
