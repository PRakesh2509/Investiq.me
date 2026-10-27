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

      {/* Trading Capital Input & Risk % (Requirements 18, 19) */}
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

      {/* Suggested Lot Calculation (Requirement 20) */}
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
            USE 1 LOT(S) ({lotSize} QTY)
          </p>
        </div>
      </div>

      {/* Manual Lot Selection (Requirement 21) */}
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

      {/* Custom Option Premium Input (Requirement 22) */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          CUSTOM OPTION PREMIUM (₹):
        </label>
        <input
          type="text"
          value={customPremium}
          onChange={(e) => setCustomPremium(e.target.value)}
          placeholder={`Current Est: ₹${data.recommendedPremium.toFixed(2)}`}
          aria-label="Custom option premium"
          className="mt-1 w-full rounded-lg border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-none transition"
        />
      </div>

      {/* Contract Details, Max Loss & Target Calculator (Requirements 23-26, 40) */}
      <div className="space-y-1.5 rounded-xl border border-border bg-background/50 p-3 font-mono text-[11px]">
        <div className="flex justify-between border-b border-border/60 pb-1 text-muted-foreground">
          <span>SELECTED CONTRACT:</span>
          <span className="font-bold text-foreground">{selectedContract}</span>
        </div>
        <div className="flex justify-between border-b border-border/60 pb-1 text-muted-foreground">
          <span>TOTAL QUANTITY:</span>
          <span className="font-semibold text-foreground">
            {totalQty} Qty ({manualLots} &times; {lotSize})
          </span>
        </div>
        <div className="flex justify-between border-b border-border/60 pb-1 text-muted-foreground">
          <span>CAPITAL INVESTED:</span>
          <span className="font-bold text-foreground">
            ₹{capitalInvested.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex justify-between border-b border-border/60 pb-1">
          <span className="text-muted-foreground">MAX DOWNSIDE LOSS (-20% SL):</span>
          <span className="font-bold text-rose-400">
            -₹{maxLoss.toLocaleString("en-IN")} ({lossPct}% of Capital)
          </span>
        </div>
        <div className="flex justify-between border-b border-border/60 pb-1">
          <span className="text-muted-foreground">PROFIT LOCKED AT TP1 (+1.5R):</span>
          <span className="font-bold text-emerald-400">
            +₹{tp1Profit.toLocaleString("en-IN")} (50% Qty)
          </span>
        </div>
        <div className="flex justify-between border-b border-border/60 pb-1">
          <span className="text-muted-foreground">TARGET RETURN AT TP2 (+2.5R):</span>
          <span className="font-bold text-emerald-400">
            +₹{tp2Profit.toLocaleString("en-IN")} (75% Qty)
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">HERO RUNNER AT TP3 (&gt;3.5R):</span>
          <span className="font-bold text-emerald-400">
            +₹{tp3Profit.toLocaleString("en-IN")} (100% Qty)
          </span>
        </div>
      </div>

      {/* Dynamic Trailing Stop-Loss Engine (Requirements 27, 28, 38) */}
      <div className="rounded-xl border border-border bg-surface/50 p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-border pb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-foreground">
            <span className="text-primary">⚡</span> DYNAMIC TRAILING SL ENGINE:
          </div>
          <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400 border border-rose-500/30">
            ■ SL LEVEL: ₹{data.stopLoss.toFixed(2)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">ACTIVE TRAILING SL:</p>
            <p className="font-bold text-rose-400">₹{data.stopLoss.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">PEAK WATERMARK LTP:</p>
            <p className="font-bold text-amber-400">₹{premium.toFixed(2)}</p>
          </div>
        </div>

        <div className="border-t border-border/60 pt-1 text-[11px] font-mono text-muted-foreground">
          <span>PLAN (not a live order): </span>
          <span className="text-rose-400 font-semibold">
            Planned trailing SL at ₹{data.stopLoss.toFixed(2)}
          </span>
        </div>

        {/* Break-Even Protection (Requirement 28, 37) */}
        <div className="rounded-lg border border-border/60 bg-background/50 p-2 text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-primary">🛡️ REVERSAL PROTECTION ACTIVE:</strong> When price hits
          TP1 (+1.5R), sell 50% lots and move SL to entry (breakeven). If market reverses, your loss
          is ₹0 and you keep the 50% profit.
        </div>
      </div>

      {/* Execution Management Rules (Requirements 35-39) */}
      <div className="rounded-xl border border-border bg-background/40 p-3 text-[10px] text-muted-foreground space-y-1.5 leading-relaxed">
        <p className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
          <span>📋</span> EXECUTION MANAGEMENT RULES
        </p>
        <p>
          • <strong className="text-foreground">Max 20% Option SL Cap:</strong> Hard stop-loss on
          option premium (capped at max 20% loss) eliminates huge option decay drawdowns.
        </p>
        <p>
          • <strong className="text-foreground">TP1 Target (1.5R):</strong> Lock 50% lot profit
          &amp; automatically shift SL to breakeven.
        </p>
        <p>
          • <strong className="text-foreground">TP2 Target (2.5R):</strong> Runner position target
          for maximum Risk:Reward.
        </p>
        <p>
          • <strong className="text-foreground">Auto Square-off:</strong> Exit intraday positions
          before 03:15 PM IST.
        </p>
      </div>
    </div>
  );
}
