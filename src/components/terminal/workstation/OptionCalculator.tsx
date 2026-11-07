import type { WorkstationData } from "./types";
import type { OptionCalculatorState } from "./useOptionCalculator";

export function OptionCalculator({
  data,
  instrument,
  calc,
}: {
  data: WorkstationData;
  instrument: string;
  calc: OptionCalculatorState;
}) {
  const {
    tradingCapital,
    setTradingCapital,
    riskPct,
    setRiskPct,
    manualLots,
    setManualLots,
    recommendedLots,
    customPremium,
    setCustomPremium,
    selectedContract,
    premium,
    lotSize,
    totalQty,
    capitalInvested,
    maxLoss,
    lossPct,
    tp1Profit,
    tp2Profit,
    tp3Profit,
    maxBudget,
    trailingSl,
    peakWatermark,
    isTp1Hit,
  } = calc;

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            OPTION PREMIUM CALCULATOR
          </h3>
        </div>
        <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
          {instrument}
        </span>
      </div>

      {/* Trading Capital Input & Risk % (Section 6.1) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            TRADING CAPITAL (₹):
          </label>
          <input
            type="number"
            value={tradingCapital}
            onChange={(e) => setTradingCapital(Math.max(1000, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-lg border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-none transition"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            MAX RISK / TRADE:
          </label>
          <div className="mt-1 flex gap-1">
            {[1, 1.5, 2].map((r) => (
              <button
                key={r}
                onClick={() => setRiskPct(r)}
                className={`flex-1 rounded-lg py-1.5 font-mono text-xs font-bold transition ${
                  riskPct === r
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "border border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {r}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Suggested Lot Calculation (Section 6.1) */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 p-2.5 text-[11px] font-mono">
        <div>
          <p className="text-muted-foreground">
            MAX BUDGET ({riskPct}% OF ₹{tradingCapital.toLocaleString("en-IN")}):
          </p>
          <p className="font-bold text-foreground">₹{maxBudget.toLocaleString("en-IN")}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-muted-foreground">RECOMMENDED:</p>
          <p className="rounded bg-surface px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-border">
            USE {recommendedLots} LOT(S) ({recommendedLots * lotSize} QTY)
          </p>
        </div>
      </div>

      {/* Manual Lot Selection */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          MANUAL LOTS SELECTOR:
        </p>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {[1, 2, 4, 10].map((l) => (
            <button
              key={l}
              onClick={() => setManualLots(l)}
              className={`rounded-lg py-1.5 font-mono text-xs font-bold transition ${
                manualLots === l
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "border border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {l} Lot{l > 1 ? "s" : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Contract & Live Premium Input (Section 6.2 & 6.3) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            SELECTED CONTRACT:
          </label>
          <input
            type="text"
            value={selectedContract}
            readOnly
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-2.5 py-1.5 font-mono text-xs font-bold text-foreground truncate"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            OPTION PREMIUM (₹):
          </label>
          <input
            type="number"
            step="0.05"
            placeholder={premium.toFixed(2)}
            value={customPremium}
            onChange={(e) => setCustomPremium(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-400 focus:border-primary focus:outline-none transition"
          />
        </div>
      </div>

      {/* Real Execution Breakdown (Section 6.3) */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background/50 p-3 text-[11px] font-mono">
        <div>
          <p className="text-muted-foreground">TOTAL QUANTITY:</p>
          <p className="font-bold text-foreground">
            {totalQty} Qty ({manualLots} Lot{manualLots > 1 ? "s" : ""})
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">CAPITAL INVESTED:</p>
          <p className="font-bold text-foreground">₹{capitalInvested.toLocaleString("en-IN")}</p>
        </div>
        <div>
          <p className="text-rose-400">MAX DOWNSIDE (-20% SL):</p>
          <p className="font-bold text-rose-400">
            -₹{maxLoss.toLocaleString("en-IN")} ({lossPct}% capital)
          </p>
        </div>
        <div>
          <p className="text-emerald-400">TP1 PROFIT (50% QTY):</p>
          <p className="font-bold text-emerald-400">+₹{tp1Profit.toLocaleString("en-IN")}</p>
        </div>
        <div>
          <p className="text-emerald-400">TP2 PROFIT (75% QTY):</p>
          <p className="font-bold text-emerald-400">+₹{tp2Profit.toLocaleString("en-IN")}</p>
        </div>
        <div>
          <p className="text-primary">TP3 HERO RUNNER (100%):</p>
          <p className="font-bold text-primary">+₹{tp3Profit.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Dynamic Trailing SL Engine (Section 6.4) */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-[11px] font-mono space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-primary flex items-center gap-1.5">
            ⚡ DYNAMIC TRAILING SL ENGINE:
          </span>
          <span className="rounded bg-surface px-2 py-0.5 text-[9px] font-bold text-muted-foreground border border-border">
            PLAN (not a live order)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <div>
            PEAK WATERMARK: <strong className="text-foreground">₹{peakWatermark.toFixed(2)}</strong>
          </div>
          <div>
            ACTIVE TRAILING SL:{" "}
            <strong className={isTp1Hit ? "text-emerald-400" : "text-rose-400"}>
              ₹{trailingSl.toFixed(2)} {isTp1Hit ? "(Breakeven)" : "(-20%)"}
            </strong>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          {isTp1Hit
            ? "✅ TP1 reached: Stop Loss automatically shifted to breakeven entry."
            : "Waiting for TP1 target hit (+30% gain) to shift SL to breakeven entry."}
        </p>
      </div>
    </div>
  );
}
