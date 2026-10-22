import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  TrendingUp,
  Shield,
  Layers,
  HelpCircle,
  X,
  Award,
  Zap,
} from "lucide-react";
import type { BacktestValidationReport, ModelPerformanceMetrics } from "@/lib/strategy-backtest";

interface BacktestValidationModalProps {
  report: BacktestValidationReport | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function BacktestValidationModal({
  report,
  isOpen,
  onClose,
}: BacktestValidationModalProps) {
  if (!isOpen || !report) return null;

  const { models, comparativeInsight, instrument, testPeriod } = report;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-foreground">
                HISTORICAL MODEL VALIDATION &amp; ALPHA BENCHMARK
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Phase 10: Event-Driven Walk-Forward Backtesting ({instrument} • {testPeriod})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Executive Empirical Finding */}
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 space-y-2 text-primary-foreground">
          <div className="flex items-center gap-2 font-bold text-sm text-primary">
            <Zap className="h-4 w-4" />
            <span>Key Research Finding</span>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed">
            {comparativeInsight.honestEvidenceSummary}
          </p>
          <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-primary">
            <span>• <strong>Greeks Alpha:</strong> {comparativeInsight.greeksAlphaImprovement}</span>
            <span>• <strong>Macro News Alpha:</strong> {comparativeInsight.newsAlphaImprovement}</span>
          </div>
        </div>

        {/* 4 Models Comparative Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-border rounded-xl overflow-hidden">
            <thead className="bg-background/80 border-b border-border text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Model Architecture</th>
                <th className="p-3 text-right">Trades Executed</th>
                <th className="p-3 text-right">Filtered Out</th>
                <th className="p-3 text-right">Win Rate</th>
                <th className="p-3 text-right">Profit Factor</th>
                <th className="p-3 text-right">Max Drawdown</th>
                <th className="p-3 text-right">Sharpe Ratio</th>
                <th className="p-3 text-right">Brier Score</th>
                <th className="p-3 text-right">Net P&amp;L (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {models.map((m) => {
                const isUnified = m.modelId === "UNIFIED_MODEL";
                return (
                  <tr
                    key={m.modelId}
                    className={`transition ${
                      isUnified ? "bg-primary/10 font-bold" : "hover:bg-accent/20"
                    }`}
                  >
                    <td className="p-3">
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        {isUnified && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        {m.modelName}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-normal line-clamp-1">
                        {m.description}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {m.tradesExecuted}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {m.tradesFilteredOut}
                    </td>
                    <td className="p-3 text-right font-mono">
                      <span className={m.winRatePct >= 65 ? "text-emerald-400 font-bold" : "text-foreground"}>
                        {m.winRatePct}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      <span className={m.profitFactor >= 2.0 ? "text-emerald-400 font-bold" : "text-foreground"}>
                        {m.profitFactor}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      <span className={m.maxDrawdownPct <= 10 ? "text-emerald-400 font-bold" : "text-rose-400"}>
                        {m.maxDrawdownPct}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-foreground">
                      {m.sharpeRatio}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {m.brierCalibrationScore}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      ₹{m.totalNetPnl.toLocaleString("en-IN")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cost & Slippage Reality Disclosure */}
        <div className="rounded-xl border border-border/80 bg-background/40 p-3 space-y-1 text-[11px] text-muted-foreground">
          <div className="font-bold text-foreground flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span>Realistic Friction &amp; Regulatory Charges Applied:</span>
          </div>
          <p>
            All backtest runs simulate round-trip execution with flat ₹40 brokerage, 0.125% STT on sell premium,
            NSE turnover charges, 18% GST, stamp duty, and dynamic stop-loss gap slippage (0.25% - 0.50%).
            Survivorship and look-ahead biases are strictly eliminated by anchoring on historical timestamps.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground hover:bg-primary/90 transition text-xs"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
