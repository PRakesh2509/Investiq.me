import { useState, useMemo } from "react";
import {
  Activity,
  Sliders,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  Sparkles,
  Info,
  Shield,
  HelpCircle,
} from "lucide-react";
import {
  simulateStrategyScenarios,
  DEFAULT_STRESS_SCENARIOS,
  type StrategyScenarioReport,
  type OptionLeg,
} from "@/lib/scenario-simulator";

interface ScenarioSimulatorPanelProps {
  underlyingSpot: number;
  daysToExpiry: number;
  lotSize: number;
  selectedContract?: string;
  currentPremium?: number;
}

export default function ScenarioSimulatorPanel({
  underlyingSpot,
  daysToExpiry,
  lotSize,
  selectedContract = "NIFTY ATM Option",
  currentPremium = 145,
}: ScenarioSimulatorPanelProps) {
  const [optionType, setOptionType] = useState<"CE" | "PE">("CE");
  const [customSpotPct, setCustomSpotPct] = useState<number>(1.0);
  const [customIvPct, setCustomIvPct] = useState<number>(0.0);
  const [customDays, setCustomDays] = useState<number>(0);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("bullish_thrust");

  // Construct legs for the simulator
  const legs: OptionLeg[] = useMemo(() => {
    return [
      {
        id: "active-leg-1",
        strike: Math.round(underlyingSpot / 50) * 50,
        type: optionType,
        action: "BUY",
        quantity: lotSize,
        entryPrice: currentPremium,
        currentPrice: currentPremium,
        iv: 14.8,
      },
    ];
  }, [underlyingSpot, optionType, lotSize, currentPremium]);

  // Run the institutional simulation
  const report: StrategyScenarioReport = useMemo(() => {
    return simulateStrategyScenarios(
      `${selectedContract} (${optionType})`,
      legs,
      underlyingSpot,
      daysToExpiry,
      lotSize,
      DEFAULT_STRESS_SCENARIOS,
    );
  }, [selectedContract, optionType, legs, underlyingSpot, daysToExpiry, lotSize]);

  // Selected scenario detail
  const activeScenario = useMemo(() => {
    return (
      report.scenarios.find((s) => s.scenario.id === selectedScenarioId) ??
      report.scenarios[0]
    );
  }, [report, selectedScenarioId]);

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur space-y-4 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
            GREEKS SCENARIO SIMULATOR &amp; TRANSACTION COST AUDIT
          </h3>
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
            PHASE 6
          </span>
        </div>

        {/* Option Type Switcher */}
        <div className="inline-flex rounded-lg border border-border bg-background/60 p-0.5 text-[10px]">
          <button
            onClick={() => setOptionType("CE")}
            className={`rounded-md px-2.5 py-1 transition font-bold ${
              optionType === "CE"
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            CALL (CE) LONG
          </button>
          <button
            onClick={() => setOptionType("PE")}
            className={`rounded-md px-2.5 py-1 transition font-bold ${
              optionType === "PE"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            PUT (PE) LONG
          </button>
        </div>
      </div>

      {/* Baseline Greeks Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <div className="text-[10px] text-muted-foreground">POSITION DELTA (Δ)</div>
          <div className={`text-base font-bold ${report.aggregateGreeks.netDelta > 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {report.aggregateGreeks.netDelta > 0 ? "+" : ""}{report.aggregateGreeks.netDelta.toFixed(2)}
          </div>
          <div className="text-[9px] text-muted-foreground">₹{(report.aggregateGreeks.netDelta * 50).toFixed(0)} P&amp;L per 50pt move</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <div className="text-[10px] text-muted-foreground">DAILY THETA BURN (Θ)</div>
          <div className="text-base font-bold text-rose-400">
            ₹{report.aggregateGreeks.netThetaPerDay.toFixed(1)}/day
          </div>
          <div className="text-[9px] text-muted-foreground">Calendar day carry cost</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <div className="text-[10px] text-muted-foreground">VEGA SENSITIVITY (ν)</div>
          <div className="text-base font-bold text-purple-400">
            ₹{report.aggregateGreeks.netVegaPerPoint.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">per 1.0% change in IV</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <div className="text-[10px] text-muted-foreground">MAX RISK OUTLAY</div>
          <div className="text-base font-bold text-rose-400">
            ₹{Math.abs(Number(report.maxLoss)).toLocaleString("en-IN")}
          </div>
          <div className="text-[9px] text-muted-foreground">1 Lot ({lotSize} Qty)</div>
        </div>
      </div>

      {/* Scenario Selection Grid (6 Standard Stress Tests) */}
      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground font-bold">
          SELECT STRESS-TEST SCENARIO (Greeks Sensitivity Matrix):
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-[10px]">
          {report.scenarios.map((scen) => {
            const isSelected = selectedScenarioId === scen.scenario.id;
            const isNetPositive = scen.netPnl >= 0;

            return (
              <button
                key={scen.scenario.id}
                onClick={() => setSelectedScenarioId(scen.scenario.id)}
                className={`rounded-xl border p-2.5 text-left transition flex flex-col justify-between space-y-1.5 ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border bg-background/40 hover:border-border/80"
                }`}
              >
                <div>
                  <div className="font-bold text-foreground truncate">{scen.scenario.name}</div>
                  <div className="text-muted-foreground text-[9px] leading-tight">
                    Spot {scen.scenario.spotChangePct > 0 ? "+" : ""}{scen.scenario.spotChangePct}% | IV {scen.scenario.ivChangePctPoints > 0 ? "+" : ""}{scen.scenario.ivChangePctPoints}%
                  </div>
                </div>

                <div className="pt-1 border-t border-border/50">
                  <div className={`text-xs font-bold ${isNetPositive ? "text-emerald-400" : "text-rose-400"}`}>
                    {isNetPositive ? "+" : ""}₹{scen.netPnl.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    ({isNetPositive ? "+" : ""}{scen.netPnlPct}%)
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Scenario Detailed Breakdown */}
      {activeScenario && (
        <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
            <div>
              <span className="text-primary font-bold text-xs uppercase">{activeScenario.scenario.name}</span>
              <p className="text-[11px] text-muted-foreground">{activeScenario.scenario.description}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground">Simulated Spot:</span>
              <span className="ml-1.5 font-bold text-foreground text-sm">
                ₹{activeScenario.simulatedSpot.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
            {/* Column 1: Financial Outcome */}
            <div className="rounded-lg border border-border/50 bg-surface/30 p-2.5 space-y-1.5">
              <span className="text-muted-foreground font-bold text-[10px] uppercase">P&amp;L Overview</span>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross P&amp;L:</span>
                <span className={`font-bold ${activeScenario.grossPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {activeScenario.grossPnl >= 0 ? "+" : ""}₹{activeScenario.grossPnl}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Brokerage &amp; Taxes:</span>
                <span className="text-rose-400">-₹{activeScenario.estimatedCharges.totalCharges}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border font-bold text-sm">
                <span>Net Return:</span>
                <span className={activeScenario.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {activeScenario.netPnl >= 0 ? "+" : ""}₹{activeScenario.netPnl} ({activeScenario.netPnlPct}%)
                </span>
              </div>
            </div>

            {/* Column 2: Greeks Attribution Decomposition */}
            <div className="rounded-lg border border-border/50 bg-surface/30 p-2.5 space-y-1.5">
              <span className="text-muted-foreground font-bold text-[10px] uppercase">Greeks P&amp;L Attribution</span>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta Move:</span>
                <span className={activeScenario.greeksAttribution.deltaPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {activeScenario.greeksAttribution.deltaPnl >= 0 ? "+" : ""}₹{activeScenario.greeksAttribution.deltaPnl}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gamma Acceleration:</span>
                <span className="text-purple-400">+{activeScenario.greeksAttribution.gammaPnl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theta Decay:</span>
                <span className="text-rose-400">₹{activeScenario.greeksAttribution.thetaPnl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vega (IV Shift):</span>
                <span className={activeScenario.greeksAttribution.vegaPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {activeScenario.greeksAttribution.vegaPnl >= 0 ? "+" : ""}₹{activeScenario.greeksAttribution.vegaPnl}
                </span>
              </div>
            </div>

            {/* Column 3: Statutory Costs Breakdown */}
            <div className="rounded-lg border border-border/50 bg-surface/30 p-2.5 space-y-1 text-[10px]">
              <span className="text-muted-foreground font-bold text-[10px] uppercase">Statutory Deductions (NSE)</span>
              <div className="flex justify-between text-muted-foreground">
                <span>Brokerage (₹20/order):</span>
                <span>₹{activeScenario.estimatedCharges.brokerage}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>STT (0.125% sell):</span>
                <span>₹{activeScenario.estimatedCharges.stt}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Exch Fee + GST (18%):</span>
                <span>₹{(activeScenario.estimatedCharges.exchangeTurnoverCharge + activeScenario.estimatedCharges.gst).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Stamp Duty:</span>
                <span>₹{activeScenario.estimatedCharges.stampDuty}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
