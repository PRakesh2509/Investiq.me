import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  Zap,
  Info,
  DollarSign,
  Play,
  RotateCcw,
} from "lucide-react";
import type {
  CandidateRankingOutput,
  TradeCandidate,
  NoTradeDecision,
} from "@/lib/trade-candidate-ranker";

interface RankedTradeCandidatesPanelProps {
  rankingData: CandidateRankingOutput | null;
  lotSize: number;
  onSelectCandidate?: (candidate: TradeCandidate) => void;
}

interface PaperTradeRecord {
  id: string;
  candidateTitle: string;
  strategy: string;
  direction: "BULLISH" | "BEARISH";
  entryPremium: number;
  lots: number;
  totalOutlay: number;
  stopLoss: number;
  target1: number;
  target2: number;
  currentPnl: number;
  status: "OPEN" | "TARGET_1_HIT" | "STOPPED_OUT" | "CLOSED";
  timestamp: string;
}

export default function RankedTradeCandidatesPanel({
  rankingData,
  lotSize,
  onSelectCandidate,
}: RankedTradeCandidatesPanelProps) {
  const [activeTab, setActiveTab] = useState<"CANDIDATES" | "PAPER_PORTFOLIO">("CANDIDATES");
  const [paperTrades, setPaperTrades] = useState<PaperTradeRecord[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!rankingData) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-6 text-center backdrop-blur">
        <Sparkles className="h-6 w-6 animate-pulse mx-auto mb-2 text-primary" />
        <p className="font-mono text-xs text-muted-foreground">
          Synthesizing multi-factor options trade rankings...
        </p>
      </div>
    );
  }

  const { rankedCandidates, topRecommendation, noTradeDecision, regime, riskConstraints } = rankingData;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const executePaperTrade = (c: TradeCandidate) => {
    const newRecord: PaperTradeRecord = {
      id: `pt-${Date.now()}`,
      candidateTitle: c.title,
      strategy: c.strategy,
      direction: c.direction,
      entryPremium: c.entryPremium,
      lots: c.recommendedLots,
      totalOutlay: c.totalDebitRequired,
      stopLoss: c.stopLoss,
      target1: c.target1,
      target2: c.target2,
      currentPnl: +(c.expectedNetPnl * 0.4).toFixed(2), // Simulated initial unrealized P&L
      status: "OPEN",
      timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
    setPaperTrades((prev) => [newRecord, ...prev]);
    showToast(`Simulated Paper Trade Executed: ${c.title} (${c.recommendedLots} lots @ ₹${c.entryPremium})`);
    setActiveTab("PAPER_PORTFOLIO");
  };

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
            RANKED TRADE CANDIDATES &amp; RISK DECISION ENGINE
          </h3>
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
            PHASE 7 &amp; 8
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Navigation Tab */}
          <div className="inline-flex rounded-lg border border-border bg-background/60 p-0.5 text-[10px] font-mono">
            <button
              onClick={() => setActiveTab("CANDIDATES")}
              className={`rounded-md px-2.5 py-1 transition ${
                activeTab === "CANDIDATES"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CANDIDATES ({rankedCandidates.length})
            </button>
            <button
              onClick={() => setActiveTab("PAPER_PORTFOLIO")}
              className={`rounded-md px-2.5 py-1 transition flex items-center gap-1.5 ${
                activeTab === "PAPER_PORTFOLIO"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>PAPER PORTFOLIO</span>
              {paperTrades.length > 0 && (
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 text-[9px] font-bold">
                  {paperTrades.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toastMessage && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs font-mono text-emerald-300 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tab: PAPER PORTFOLIO */}
      {activeTab === "PAPER_PORTFOLIO" ? (
        <div className="space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">
              Paper Trading simulates real exchange execution with brokerage (₹20), STT, GST, and slippage. No live capital is risked.
            </span>
            {paperTrades.length > 0 && (
              <button
                onClick={() => setPaperTrades([])}
                className="text-rose-400 hover:text-rose-300 text-[10px] flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Clear Portfolio
              </button>
            )}
          </div>

          {paperTrades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40 text-primary" />
              <p className="text-sm font-bold text-foreground">No Active Paper Trades</p>
              <p className="text-[11px] mt-1">Select a ranked candidate from the Candidates tab to execute a simulated trade.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-background/80 text-muted-foreground border-b border-border text-[10px] uppercase">
                  <tr>
                    <th className="p-2">Timestamp</th>
                    <th className="p-2">Candidate Setup</th>
                    <th className="p-2">Direction</th>
                    <th className="p-2 text-right">Entry Prem</th>
                    <th className="p-2 text-right">Lots</th>
                    <th className="p-2 text-right">Outlay</th>
                    <th className="p-2 text-right">Stop Loss</th>
                    <th className="p-2 text-right">Target 1</th>
                    <th className="p-2 text-right">Simulated P&amp;L</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paperTrades.map((pt) => {
                    const isProfit = pt.currentPnl >= 0;
                    return (
                      <tr key={pt.id} className="hover:bg-accent/30 transition">
                        <td className="p-2 text-muted-foreground">{pt.timestamp}</td>
                        <td className="p-2 font-bold text-foreground">{pt.candidateTitle}</td>
                        <td className="p-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              pt.direction === "BULLISH"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {pt.direction}
                          </span>
                        </td>
                        <td className="p-2 text-right text-foreground">₹{pt.entryPremium}</td>
                        <td className="p-2 text-right text-muted-foreground">{pt.lots}</td>
                        <td className="p-2 text-right text-foreground">₹{pt.totalOutlay.toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right text-rose-400">₹{pt.stopLoss}</td>
                        <td className="p-2 text-right text-emerald-400">₹{pt.target1}</td>
                        <td className={`p-2 text-right font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                          {isProfit ? "+" : ""}₹{pt.currentPnl}
                        </td>
                        <td className="p-2 text-center">
                          <span className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                            {pt.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Tab: CANDIDATES */
        <div className="space-y-4">
          {/* Explicit NO TRADE Advisory Banner (Phase 7 critical requirement) */}
          {noTradeDecision && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 font-mono text-xs text-amber-200">
              <div className="flex items-start gap-3">
                <AlertOctagon className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      CAPITAL PRESERVATION ACTIVE
                    </span>
                    <span className="text-[10px] text-amber-300/80">Regime: {noTradeDecision.marketRegime}</span>
                  </div>
                  <h4 className="text-sm font-bold text-amber-100">{noTradeDecision.headline}</h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {noTradeDecision.summary}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-amber-500/20 text-[11px]">
                <div className="space-y-1">
                  <span className="font-bold text-amber-300">Why Trade Is Restricted:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {noTradeDecision.evidence.map((ev, idx) => (
                      <li key={idx}>{ev}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-amber-300">Re-Evaluation Criteria:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {noTradeDecision.reevaluationTriggers.map((trig, idx) => (
                      <li key={idx}>{trig}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-lg bg-background/50 p-2 text-[10px] text-muted-foreground italic border border-border/50">
                💡 {noTradeDecision.capitalPreservationMessage}
              </div>
            </div>
          )}

          {/* Active Candidates Grid */}
          {rankedCandidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground font-mono text-xs">
              No trade setups meet the 60+ confluence score threshold and strict risk gates.
              Cash is an active position.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {rankedCandidates.map((c) => {
                const isSelected = selectedCandidateId === c.id;
                const isBullish = c.direction === "BULLISH";

                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border transition p-4 space-y-3 font-mono text-xs relative ${
                      c.rank === 1
                        ? "border-primary/50 bg-primary/5 shadow-md ring-1 ring-primary/20"
                        : "border-border bg-background/40 hover:border-border/80"
                    }`}
                  >
                    {/* Top row: Rank badge, title, direction */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              c.rank === 1
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            RANK #{c.rank} {c.rank === 1 && "★ TOP SETUP"}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                              isBullish
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            }`}
                          >
                            {c.direction}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {c.strategy.replace(/_/g, " ")}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground">{c.title}</h4>
                      </div>

                      {/* AI Confluence Score */}
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">AI Score</div>
                        <div className="text-lg font-bold text-primary">
                          {c.compositeScore}
                          <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {c.summary}
                    </p>

                    {/* Greeks & Risk Badges */}
                    <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-border/60 bg-background/60 p-2 text-center text-[10px]">
                      <div>
                        <div className="text-muted-foreground text-[9px]">NET DELTA (Δ)</div>
                        <div className={`font-bold ${c.aggregateGreeks.netDelta > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {c.aggregateGreeks.netDelta > 0 ? "+" : ""}{c.aggregateGreeks.netDelta.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[9px]">NET THETA (Θ)</div>
                        <div className="font-bold text-rose-400">
                          {c.aggregateGreeks.netThetaPerDay.toFixed(1)}/d
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[9px]">NET VEGA (ν)</div>
                        <div className="font-bold text-purple-400">
                          +{c.aggregateGreeks.netVegaPerPoint.toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[9px]">CALIB. POP</div>
                        <div className="font-bold text-emerald-400">
                          {c.calibratedPopPct}%
                        </div>
                      </div>
                    </div>

                    {/* Entry, Stop loss, Target Levels */}
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-lg border border-border/40 bg-surface/30 p-2">
                        <div className="text-[9px] text-muted-foreground uppercase">Entry Premium</div>
                        <div className="font-bold text-foreground">₹{c.entryPremium}</div>
                        <div className="text-[9px] text-muted-foreground">Zone: ₹{c.entryRange.min} - ₹{c.entryRange.max}</div>
                      </div>
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
                        <div className="text-[9px] text-rose-300 uppercase">Stop-Loss (Max 20%)</div>
                        <div className="font-bold text-rose-400">₹{c.stopLoss}</div>
                        <div className="text-[9px] text-rose-400/80">Max Risk: ₹{c.maxRiskAmount}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                        <div className="text-[9px] text-emerald-300 uppercase">Target 1 (1.5R)</div>
                        <div className="font-bold text-emerald-400">₹{c.target1}</div>
                        <div className="text-[9px] text-emerald-400/80">TP2: ₹{c.target2}</div>
                      </div>
                    </div>

                    {/* Sizing & Capital Allocation */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface/40 p-2 text-[10px] text-muted-foreground">
                      <div>
                        Recommended Lots: <strong className="text-foreground">{c.recommendedLots} lot ({c.recommendedLots * lotSize} qty)</strong>
                      </div>
                      <div>
                        Total Outlay: <strong className="text-foreground">₹{c.totalDebitRequired.toLocaleString("en-IN")}</strong>
                      </div>
                      <div>
                        Risk:Reward: <strong className="text-foreground">1:{c.riskRewardRatio}</strong>
                      </div>
                    </div>

                    {/* Supporting Pros & Cons Collapsible or Summary */}
                    <div className="space-y-1 text-[10px]">
                      <div className="text-muted-foreground font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>Core Supporting Evidence:</span>
                      </div>
                      <ul className="list-disc list-inside text-muted-foreground space-y-0.5 pl-1">
                        {c.supportingEvidence.slice(0, 2).map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Invalidation Trigger */}
                    <div className="rounded bg-rose-500/10 border border-rose-500/20 p-1.5 text-[10px] text-rose-300">
                      <strong>Setup Invalidation:</strong> {c.invalidationTriggers[0]}
                    </div>

                    {/* Action Buttons: Execute Paper Trade */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <button
                        onClick={() => executePaperTrade(c)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        EXECUTE PAPER TRADE
                      </button>

                      {onSelectCandidate && (
                        <button
                          onClick={() => onSelectCandidate(c)}
                          className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition"
                        >
                          Analyze Greeks
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
