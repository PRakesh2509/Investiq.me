import { TrendingUp } from "lucide-react";
import type { IPO } from "@/lib/ipos";
import { formatINR } from "@/lib/market-data";

export function ScenariosSection({ scenarios }: { scenarios: IPO["scenarios"] }) {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Listing Price Scenarios &amp; Estimated Gain
          </h3>
          <span className="text-[10px] text-muted-foreground">
            Formula: ((Est. Price - Issue Price) / Issue Price) × 100
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Downside Scenario</span>
              <span className="text-xs font-semibold text-destructive">
                {scenarios.downside.gainPct >= 0 ? "+" : ""}
                {scenarios.downside.gainPct}%
              </span>
            </div>
            <p className="mt-1 font-display text-lg font-bold">₹{scenarios.downside.price}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Est. Return: {formatINR(scenarios.downside.profitPerLot)} / lot
            </p>
          </div>

          <div className="rounded-xl border border-primary/40 bg-primary/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-primary font-medium">Base Case (GMP)</span>
              <span className="text-xs font-semibold text-primary">+{scenarios.base.gainPct}%</span>
            </div>
            <p className="mt-1 font-display text-lg font-bold text-primary">
              ₹{scenarios.base.price}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Est. Profit:{" "}
              <span className="font-medium text-foreground">
                {formatINR(scenarios.base.profitPerLot)}
              </span>{" "}
              / lot
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-medium">Upside Scenario</span>
              <span className="text-xs font-semibold text-emerald-400">
                +{scenarios.upside.gainPct}%
              </span>
            </div>
            <p className="mt-1 font-display text-lg font-bold text-emerald-400">
              ₹{scenarios.upside.price}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Est. Profit:{" "}
              <span className="font-medium text-emerald-400">
                +{formatINR(scenarios.upside.profitPerLot)}
              </span>{" "}
              / lot
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
