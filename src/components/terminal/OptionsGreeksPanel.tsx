import { useState } from "react";
import {
  HelpCircle,
  Activity,
  Calculator,
  Info,
  Clock,
  Sparkles,
  Shield,
  Layers,
} from "lucide-react";
import type { NormalizedOptionChain, NormalizedOptionStrike } from "@/lib/options-data-provider.server";

interface OptionsGreeksPanelProps {
  chain: NormalizedOptionChain | null;
  underlyingPrice: number;
  lotSize: number;
  onSelectStrike?: (strike: number, type: "CE" | "PE", ltp: number) => void;
}

export default function OptionsGreeksPanel({
  chain,
  underlyingPrice,
  lotSize,
  onSelectStrike,
}: OptionsGreeksPanelProps) {
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"MATRIX" | "DEEP_DIVE">("MATRIX");

  if (!chain || !chain.strikes.length) {
    return (
      <div className="rounded-xl border border-border bg-background/50 p-6 text-center font-mono text-xs text-muted-foreground">
        <Activity className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
        Calculating Black-Scholes Greeks and Implied Volatility Surface...
      </div>
    );
  }

  const strikes = chain.strikes;
  const atmStrike = strikes.find((s) => s.isAtm) ?? strikes[Math.floor(strikes.length / 2)];
  const activeStrikeData = strikes.find((s) => s.strike === (selectedStrike ?? atmStrike.strike)) ?? atmStrike;

  const formattedTime = new Date(chain.timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Greeks Methodology & Attribution Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground">
            PRICING MODEL: European Black-Scholes (1973) with Merton Dividend Extension
          </span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground text-[10px]">
          <span>Risk-Free Rate: <strong>6.8% (RBI 91D T-Bill)</strong></span>
          <span>Dividend Yield: <strong>1.2%</strong></span>
          <span>DTE: <strong>{chain.daysToExpiry.toFixed(1)} days</strong></span>
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Clock className="h-3 w-3" />
            {formattedTime} IST
          </span>
        </div>
      </div>

      {/* Tooltip Quick Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="group relative rounded-lg border border-border bg-background/50 p-2 hover:border-primary/50 transition cursor-help">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-bold text-foreground">DELTA (Δ)</span>
            <HelpCircle className="h-3 w-3 text-primary" />
          </div>
          <p className="mt-1 text-muted-foreground line-clamp-1">Rate of change vs underlying (0 to 1)</p>
          <div className="hidden group-hover:block absolute z-30 left-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover p-2.5 text-[10px] text-popover-foreground shadow-2xl backdrop-blur">
            <p className="font-bold text-foreground">Delta (Δ):</p>
            <p className="mt-1 text-muted-foreground">
              Measures how much the option price moves for every ₹1 move in the underlying index. A 0.50 delta Call gains ₹0.50 if the index rises ₹1.
            </p>
          </div>
        </div>

        <div className="group relative rounded-lg border border-border bg-background/50 p-2 hover:border-primary/50 transition cursor-help">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-bold text-foreground">GAMMA (Γ)</span>
            <HelpCircle className="h-3 w-3 text-primary" />
          </div>
          <p className="mt-1 text-muted-foreground line-clamp-1">Acceleration of Delta per ₹1 move</p>
          <div className="hidden group-hover:block absolute z-30 left-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover p-2.5 text-[10px] text-popover-foreground shadow-2xl backdrop-blur">
            <p className="font-bold text-foreground">Gamma (Γ):</p>
            <p className="mt-1 text-muted-foreground">
              Rate of change of Delta for a ₹1 shift in underlying spot. High gamma near expiry creates rapid non-linear P&amp;L shifts for ATM options.
            </p>
          </div>
        </div>

        <div className="group relative rounded-lg border border-border bg-background/50 p-2 hover:border-primary/50 transition cursor-help">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-bold text-foreground">THETA (Θ)</span>
            <HelpCircle className="h-3 w-3 text-primary" />
          </div>
          <p className="mt-1 text-rose-400 line-clamp-1">Daily time decay cost (₹/day)</p>
          <div className="hidden group-hover:block absolute z-30 right-0 sm:left-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover p-2.5 text-[10px] text-popover-foreground shadow-2xl backdrop-blur">
            <p className="font-bold text-foreground">Theta (Θ):</p>
            <p className="mt-1 text-muted-foreground">
              Expected reduction in option premium after 1 calendar day if underlying price and volatility remain unchanged. Always negative for long options.
            </p>
          </div>
        </div>

        <div className="group relative rounded-lg border border-border bg-background/50 p-2 hover:border-primary/50 transition cursor-help">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-bold text-foreground">VEGA (ν)</span>
            <HelpCircle className="h-3 w-3 text-primary" />
          </div>
          <p className="mt-1 text-muted-foreground line-clamp-1">Sensitivity per 1% change in IV</p>
          <div className="hidden group-hover:block absolute z-30 right-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover p-2.5 text-[10px] text-popover-foreground shadow-2xl backdrop-blur">
            <p className="font-bold text-foreground">Vega (ν):</p>
            <p className="mt-1 text-muted-foreground">
              Change in premium for a 1.0 percentage point change in Implied Volatility (IV). An option with 8.5 Vega gains ₹8.5 if IV expands from 14% to 15%.
            </p>
          </div>
        </div>
      </div>

      {/* Greeks Sensitivity Matrix Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-background/40">
        <table className="w-full text-center text-[11px]">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-[9px] uppercase tracking-wider text-muted-foreground">
              {/* Call Greeks */}
              <th className="py-2 px-2 text-left text-emerald-400">CALL IV</th>
              <th className="py-2 px-2 text-emerald-400">DELTA</th>
              <th className="py-2 px-2 text-emerald-400">GAMMA</th>
              <th className="py-2 px-2 text-emerald-400">THETA</th>
              <th className="py-2 px-2 text-emerald-400">VEGA</th>
              <th className="py-2 px-2 text-right text-emerald-400">CALL LTP</th>

              {/* Strike */}
              <th className="py-2 px-3 font-bold text-foreground bg-surface/90 border-x border-border">
                STRIKE ({chain.expiryDate})
              </th>

              {/* Put Greeks */}
              <th className="py-2 px-2 text-left text-rose-400">PUT LTP</th>
              <th className="py-2 px-2 text-rose-400">VEGA</th>
              <th className="py-2 px-2 text-rose-400">THETA</th>
              <th className="py-2 px-2 text-rose-400">GAMMA</th>
              <th className="py-2 px-2 text-rose-400">DELTA</th>
              <th className="py-2 px-2 text-right text-rose-400">PUT IV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono">
            {strikes.map((row) => {
              const isSelected = (selectedStrike ?? atmStrike.strike) === row.strike;
              return (
                <tr
                  key={row.strike}
                  onClick={() => setSelectedStrike(row.strike)}
                  className={`cursor-pointer transition hover:bg-accent/30 ${
                    row.isAtm ? "bg-primary/10 font-bold" : isSelected ? "bg-accent/20" : ""
                  }`}
                >
                  {/* Call Greeks */}
                  <td className="py-2 px-2 text-left text-muted-foreground">
                    {(row.ce.greeks.iv * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-emerald-400 font-semibold">
                    +{row.ce.greeks.delta.toFixed(3)}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground text-[10px]">
                    {row.ce.greeks.gamma.toFixed(4)}
                  </td>
                  <td className="py-2 px-2 text-rose-400/90 text-[10px]">
                    ₹{row.ce.greeks.thetaPerDay.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground text-[10px]">
                    ₹{row.ce.greeks.vegaPerPoint.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-emerald-400">
                    ₹{row.ce.ltp.toFixed(2)}
                  </td>

                  {/* Strike Column */}
                  <td
                    className={`py-2 px-3 font-bold border-x border-border ${
                      row.isAtm
                        ? "text-primary bg-primary/20 shadow-inner"
                        : "text-foreground bg-surface/30"
                    }`}
                  >
                    {row.strike}
                    {row.isAtm && (
                      <span className="ml-1 text-[9px] uppercase px-1 py-0.2 rounded bg-primary text-primary-foreground">
                        ATM
                      </span>
                    )}
                  </td>

                  {/* Put Greeks */}
                  <td className="py-2 px-2 text-left font-bold text-rose-400">
                    ₹{row.pe.ltp.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground text-[10px]">
                    ₹{row.pe.greeks.vegaPerPoint.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-rose-400/90 text-[10px]">
                    ₹{row.pe.greeks.thetaPerDay.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground text-[10px]">
                    {row.pe.greeks.gamma.toFixed(4)}
                  </td>
                  <td className="py-2 px-2 text-rose-400 font-semibold">
                    {row.pe.greeks.delta.toFixed(3)}
                  </td>
                  <td className="py-2 px-2 text-right text-muted-foreground">
                    {(row.pe.greeks.iv * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Strike Detailed Sensitivity Card */}
      <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-[11px]">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground">
              STRIKE {activeStrikeData.strike} SENSITIVITY PROFILE
            </span>
            {activeStrikeData.isAtm && (
              <span className="rounded bg-primary/20 border border-primary/40 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                AT-THE-MONEY
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground text-[10px]">
            <span>Underlying Spot: <strong>₹{underlyingPrice.toFixed(2)}</strong></span>
            <span>Lot Size: <strong>{lotSize} Qty</strong></span>
            <span>Intrinsic CE: <strong>₹{activeStrikeData.ce.greeks.intrinsicValue.toFixed(1)}</strong></span>
            <span>Time Value CE: <strong>₹{activeStrikeData.ce.greeks.timeValue.toFixed(1)}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          {/* Call Option Summary */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-emerald-400">
                {chain.symbol} {activeStrikeData.strike} CALL (CE)
              </span>
              <span className="font-bold text-emerald-400">₹{activeStrikeData.ce.ltp.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              If underlying rises by <strong>+100 pts</strong>: Call gains approx{" "}
              <strong className="text-emerald-400">
                +₹{(activeStrikeData.ce.greeks.delta * 100).toFixed(1)}
              </strong>{" "}
              per share (+₹{(activeStrikeData.ce.greeks.delta * 100 * lotSize).toFixed(0)} per lot).
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Holding overnight costs approx{" "}
              <strong className="text-rose-400">
                ₹{Math.abs(activeStrikeData.ce.greeks.thetaPerDay * lotSize).toFixed(0)}
              </strong>{" "}
              in theta decay per lot.
            </p>
          </div>

          {/* Put Option Summary */}
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/10 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-rose-400">
                {chain.symbol} {activeStrikeData.strike} PUT (PE)
              </span>
              <span className="font-bold text-rose-400">₹{activeStrikeData.pe.ltp.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              If underlying falls by <strong>-100 pts</strong>: Put gains approx{" "}
              <strong className="text-rose-400">
                +₹{(Math.abs(activeStrikeData.pe.greeks.delta) * 100).toFixed(1)}
              </strong>{" "}
              per share (+₹{(Math.abs(activeStrikeData.pe.greeks.delta) * 100 * lotSize).toFixed(0)} per lot).
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Holding overnight costs approx{" "}
              <strong className="text-rose-400">
                ₹{Math.abs(activeStrikeData.pe.greeks.thetaPerDay * lotSize).toFixed(0)}
              </strong>{" "}
              in theta decay per lot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
