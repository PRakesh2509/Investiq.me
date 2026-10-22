import { useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Layers,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ContinuousFnoData } from "@/lib/fno-continuous-engine.functions";
import type { ExplainableTradeCandidate } from "@/lib/services/tradeCandidateService";

interface ContinuousFnoIntelligencePanelProps {
  data: ContinuousFnoData | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export default function ContinuousFnoIntelligencePanel({
  data,
  isLoading = false,
  onRefresh,
}: ContinuousFnoIntelligencePanelProps) {
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-surface/50 p-6 text-center font-mono text-xs text-muted-foreground backdrop-blur">
        <Activity className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
        Initializing Continuous F&amp;O + Options Greeks Intelligence Stream...
      </div>
    );
  }

  const { session, snapshot, greeks, greeksReport, analysis, candidatesResult, timestamp } = data;
  const { marketBias, technical, positioning, confluenceScore, confluenceFactors, divergenceWarnings, primaryObservation } = analysis;
  const { activeCandidates, historicalCandidates, noTradeDecision } = candidatesResult;

  const biasColor =
    marketBias === "STRONG_BULLISH"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : marketBias === "MILD_BULLISH"
      ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
      : marketBias === "STRONG_BEARISH"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
      : marketBias === "MILD_BEARISH"
      ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
      : "border-amber-500/40 bg-amber-500/10 text-amber-400";

  const formattedTime = new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* 1. Header Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/60 p-4 backdrop-blur shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-primary animate-pulse" />
            <h3 className="font-sans font-bold text-sm tracking-tight text-foreground">
              CONTINUOUS F&amp;O INTELLIGENCE &amp; TRADE CANDIDATE ENGINE
            </h3>
          </div>
          <span className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${biasColor}`}>
            BIAS: {marketBias.replace("_", " ")}
          </span>
          <span className="rounded-lg border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            CONFLUENCE: <strong className="text-foreground">{confluenceScore}/100</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {/* Greeks Provider Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] ${
              greeks.isDirectSensibullAuthorized
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-sky-500/30 bg-sky-500/10 text-sky-400"
            }`}
            title={greeks.provider}
          >
            {greeks.isDirectSensibullAuthorized ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <Shield className="h-3 w-3" />
            )}
            <span>{greeks.provider}</span>
          </span>

          {/* Session Indicator */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              session.isMarketOpen
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                session.isMarketOpen ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            {session.phase.replace("_", " ")}
          </span>

          {/* Timestamp & Refresh */}
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formattedTime} IST
          </span>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-0.5 hover:bg-accent text-foreground transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              <span>Poll</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Combined Analysis & Confluence Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Technical & Trend */}
        <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-1">
            <span className="font-semibold text-foreground">1. Price Action</span>
            <span className={technical.trend === "BULLISH" ? "text-emerald-400" : "text-rose-400"}>
              {technical.trend}
            </span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">VWAP Status:</span>
              <span className="font-medium text-foreground">{technical.priceVsVwap.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">EMA Alignment:</span>
              <span className="font-medium text-foreground">{technical.emaCross.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RSI (14):</span>
              <span className="font-medium text-foreground">{technical.rsi14} ({technical.rsiCondition})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Key S/R Range:</span>
              <span className="font-medium text-foreground">₹{technical.pivotSupport} — ₹{technical.pivotResistance}</span>
            </div>
          </div>
        </div>

        {/* Options Positioning */}
        <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-1">
            <span className="font-semibold text-foreground">2. Options Positioning</span>
            <span className="text-primary font-bold">PCR {positioning.pcr.toFixed(2)}</span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">OI Buildup:</span>
              <span className="font-medium text-foreground">{positioning.oiBuildup.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Pain Strike:</span>
              <span className="font-medium text-foreground">₹{positioning.maxPainStrike}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Call Wall (Resist):</span>
              <span className="font-medium text-rose-400">₹{positioning.highestCallOiStrike}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Put Wall (Support):</span>
              <span className="font-medium text-emerald-400">₹{positioning.highestPutOiStrike}</span>
            </div>
          </div>
        </div>

        {/* Greeks Context */}
        <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-1">
            <span className="font-semibold text-foreground">3. Greeks &amp; Volatility</span>
            <span className="text-muted-foreground text-[10px]">{greeksReport.daysToExpiry.toFixed(1)} DTE</span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ATM Delta Skew:</span>
              <span className="font-medium text-foreground">{greeksReport.deltaAnalysis.directionalBias.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gamma Risk Level:</span>
              <span className={greeksReport.gammaAnalysis.gammaRiskLevel.includes("EXTREME") ? "text-rose-400 font-bold" : "text-foreground"}>
                {greeksReport.gammaAnalysis.gammaRiskLevel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Theta Burn:</span>
              <span className="font-medium text-amber-400">-₹{greeksReport.thetaAnalysis.atmDailyDecayPerShare}/sh/day</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IV Smile Skew:</span>
              <span className="font-medium text-foreground">+{greeksReport.vegaAnalysis.ivSmileSkew}% ({greeksReport.vegaAnalysis.ivRegime})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Observation Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-foreground/90 flex items-start gap-2">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-primary">Synchronized F&amp;O Observation:</p>
          <p className="font-sans text-xs leading-relaxed text-foreground">{primaryObservation}</p>
          {divergenceWarnings.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {divergenceWarnings.map((w, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400 font-mono">
                  ⚠️ {w}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Trade Candidates Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-1">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h4 className="font-bold text-foreground uppercase tracking-wide">
              Active Trade Candidates ({activeCandidates.length})
            </h4>
          </div>
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <span>Candidate Lifecycle Log ({historicalCandidates.length})</span>
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* If NO TRADE Decision is Active */}
        {noTradeDecision && activeCandidates.length === 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                <span className="font-bold text-foreground text-sm">{noTradeDecision.headline}</span>
              </div>
              <span className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                {noTradeDecision.reasonCode}
              </span>
            </div>
            <p className="font-sans text-xs text-foreground/90 leading-relaxed">
              {noTradeDecision.summary}
            </p>
            <div className="rounded-xl border border-border bg-background/50 p-3 space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Preservation &amp; Discipline Rule:</span>
              <p className="font-sans text-[11px] text-emerald-400 font-medium">
                {noTradeDecision.capitalPreservationMessage}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground font-bold self-center">Re-evaluation Triggers:</span>
              {noTradeDecision.reevaluationTriggers.map((t, i) => (
                <span key={i} className="rounded bg-accent/60 px-2 py-0.5 text-[10px] text-foreground">
                  • {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Active Candidate Cards */}
        {activeCandidates.map((candidate) => {
          const isExpanded = expandedCandidateId === candidate.id;
          const isCall = candidate.strategyType.includes("CALL");

          const lifecycleBadge =
            candidate.lifecycleStatus === "CONFIRMED"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : candidate.lifecycleStatus === "TARGET_REACHED"
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
              : candidate.lifecycleStatus === "STOP_CONDITION_REACHED"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
              : "border-sky-500/40 bg-sky-500/10 text-sky-400";

          return (
            <div
              key={candidate.id}
              className="rounded-2xl border border-border bg-surface/70 p-4 shadow-lg backdrop-blur space-y-3"
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      isCall ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    }`}
                  >
                    {isCall ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        {candidate.instrument} {candidate.strike} {candidate.callPut}
                      </span>
                      <span className="rounded bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-bold">
                        {candidate.strategyType.replace("_", " ")}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${lifecycleBadge}`}>
                        {candidate.lifecycleStatus}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Expiry: {candidate.expiry} · Ref Premium: ₹{candidate.currentReferencePrice.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">SETUP SCORE</span>
                    <span className="font-extrabold text-sm text-primary">{candidate.setupScore}/100</span>
                  </div>
                  <button
                    onClick={() => setExpandedCandidateId(isExpanded ? null : candidate.id)}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={isExpanded ? "Collapse" : "Expand candidate details"}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Core Execution Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-xl border border-border bg-background/50 p-2.5">
                  <span className="text-muted-foreground text-[10px] block">ENTRY ZONE</span>
                  <span className="font-bold text-foreground text-xs">
                    ₹{candidate.entryZone.min} — ₹{candidate.entryZone.max}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-2.5">
                  <span className="text-muted-foreground text-[10px] block">STOP LOSS</span>
                  <span className="font-bold text-rose-400 text-xs">
                    ₹{candidate.stopLoss}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-2.5">
                  <span className="text-muted-foreground text-[10px] block">TARGETS (T1 / T2)</span>
                  <span className="font-bold text-emerald-400 text-xs">
                    ₹{candidate.targetLevels.t1} / ₹{candidate.targetLevels.t2}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-2.5">
                  <span className="text-muted-foreground text-[10px] block">NET R:R (AFTER FEES)</span>
                  <span className="font-bold text-primary text-xs">
                    1:{candidate.riskRewardRatio}
                  </span>
                </div>
              </div>

              {/* Sizing & Capital Allocation */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/30 px-3 py-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Position Sizing: </span>
                  <strong className="text-foreground">
                    {candidate.positionSizing.recommendedLots} Lots ({candidate.positionSizing.totalQuantity} Qty)
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Required Debit: </span>
                  <strong className="text-foreground">₹{candidate.totalDebitRequired.toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Capital at Risk: </span>
                  <strong className="text-rose-400">₹{candidate.maxEstimatedLoss.toLocaleString("en-IN")}</strong>
                </div>
              </div>

              {/* Expandable Breakdown */}
              {isExpanded && (
                <div className="space-y-3 pt-2 border-t border-border/60 text-xs animate-in fade-in duration-150">
                  {/* Trigger & Invalidation */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl border border-border bg-background/40 p-2.5 space-y-1">
                      <span className="font-bold text-primary block">Entry Trigger:</span>
                      <p className="font-sans text-foreground/90">{candidate.entryTrigger}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/40 p-2.5 space-y-1">
                      <span className="font-bold text-rose-400 block">Invalidation Trigger:</span>
                      <p className="font-sans text-foreground/90">{candidate.invalidationCondition}</p>
                    </div>
                  </div>

                  {/* Greeks Breakdown */}
                  <div className="rounded-xl border border-border bg-background/40 p-2.5 space-y-1 text-[11px]">
                    <span className="font-bold text-foreground block">Net Contract Greeks Profile:</span>
                    <div className="grid grid-cols-4 gap-2 pt-1 font-mono">
                      <div><span className="text-muted-foreground">Net Δ:</span> <strong>{candidate.greeksAndIvContext.netDelta.toFixed(3)}</strong></div>
                      <div><span className="text-muted-foreground">Net Γ:</span> <strong>{candidate.greeksAndIvContext.netGamma.toFixed(4)}</strong></div>
                      <div><span className="text-muted-foreground">Net Θ:</span> <strong className="text-amber-400">{candidate.greeksAndIvContext.netThetaPerDay.toFixed(1)}/day</strong></div>
                      <div><span className="text-muted-foreground">Net ν:</span> <strong>{candidate.greeksAndIvContext.netVegaPerPoint.toFixed(1)}</strong></div>
                    </div>
                  </div>

                  {/* Reasons For / Against */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-2.5 space-y-1">
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Supporting Reasons ({candidate.reasonsSupporting.length})
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-foreground/90 font-sans">
                        {candidate.reasonsSupporting.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-2.5 space-y-1">
                      <span className="font-bold text-rose-400 flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" /> Opposing Risks &amp; Costs ({candidate.reasonsAgainst.length})
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-foreground/90 font-sans">
                        {candidate.reasonsAgainst.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* 7-Factor Scoring Methodology Breakdown */}
                  <div className="rounded-xl border border-border bg-background/50 p-2.5 space-y-1.5 text-[11px]">
                    <span className="font-bold text-foreground">Scoring Methodology Factors:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {candidate.scoringMethodology.scoreFactors.map((f, i) => (
                        <div key={i} className="rounded border border-border/60 bg-surface/60 p-1.5">
                          <span className="text-muted-foreground text-[10px] block truncate">{f.name}</span>
                          <span className="font-bold text-foreground">{f.score}/100</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Historical Lifecycle Closed Log */}
        {showHistory && historicalCandidates.length > 0 && (
          <div className="rounded-2xl border border-border bg-background/50 p-4 space-y-2 text-xs">
            <h5 className="font-bold text-muted-foreground uppercase text-[11px]">Session Candidate Lifecycle History</h5>
            <div className="space-y-1.5">
              {historicalCandidates.map((hc) => (
                <div key={hc.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface/60 p-2 text-[11px]">
                  <div>
                    <span className="font-bold text-foreground">{hc.instrument} {hc.strike} {hc.strategyType}</span>
                    <span className="text-muted-foreground ml-2 text-[10px]">{hc.timestamp.slice(11, 19)}</span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    hc.lifecycleStatus === "TARGET_REACHED" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                  }`}>
                    {hc.lifecycleStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
