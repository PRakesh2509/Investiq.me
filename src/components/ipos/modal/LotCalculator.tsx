import { Calculator, Minus, Plus } from "lucide-react";
import type { IPO } from "@/lib/ipos";
import { formatINR } from "@/lib/market-data";

export function LotCalculator({
  ipo,
  lots,
  setLots,
  totalShares,
  totalInvestment,
  baseProfit,
  upsideProfit,
}: {
  ipo: IPO;
  lots: number;
  setLots: (fn: (l: number) => number) => void;
  totalShares: number;
  totalInvestment: number;
  baseProfit: number;
  upsideProfit: number;
}) {
  return (
    <>
      <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Lot Profitability Calculator</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Lots:</span>
            <button
              onClick={() => setLots((l) => Math.max(1, l - 1))}
              aria-label="Decrease lots"
              className="grid h-6 w-6 place-items-center rounded bg-background border border-border text-xs hover:bg-accent"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="font-bold text-sm min-w-[24px] text-center">{lots}</span>
            <button
              onClick={() => setLots((l) => l + 1)}
              aria-label="Increase lots"
              className="grid h-6 w-6 place-items-center rounded bg-background border border-border text-xs hover:bg-accent"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-background/50 border border-border p-3">
            <p className="text-muted-foreground">Total Shares</p>
            <p className="mt-1 font-bold text-sm">{totalShares.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-foreground">
              {lots} Lot × {ipo.lotSize} sh
            </p>
          </div>
          <div className="rounded-lg bg-background/50 border border-border p-3">
            <p className="text-muted-foreground">Capital Required</p>
            <p className="mt-1 font-bold text-sm text-foreground">{formatINR(totalInvestment)}</p>
            <p className="text-[10px] text-muted-foreground">At Cut-off ₹{ipo.maxPrice}</p>
          </div>
          <div className="rounded-lg bg-background/50 border border-border p-3">
            <p className="text-muted-foreground">Expected Profit (Base)</p>
            <p className="mt-1 font-bold text-sm text-emerald-400">+{formatINR(baseProfit)}</p>
            <p className="text-[10px] text-muted-foreground">At Current GMP</p>
          </div>
          <div className="rounded-lg bg-background/50 border border-border p-3">
            <p className="text-muted-foreground">Upside Profit</p>
            <p className="mt-1 font-bold text-sm text-emerald-400">+{formatINR(upsideProfit)}</p>
            <p className="text-[10px] text-muted-foreground">At Momentum High</p>
          </div>
        </div>
      </div>
    </>
  );
}
