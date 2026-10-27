import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { InstrumentConfig, WorkstationData } from "./types";

/** Option premium / risk calculator state. Derived numbers are pure functions of user inputs. */
export function useOptionCalculator(
  instrument: string,
  data: WorkstationData | null,
  cfg: InstrumentConfig,
) {
  const [tradingCapital, setTradingCapital] = useState<number>(30000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [manualLots, setManualLots] = useState<number>(10);
  const [customPremium, setCustomPremium] = useState<string>("");
  const [selectedContract, setSelectedContract] = useState<string>("");

  // Seed the contract / premium once per instrument from the first server payload.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data) {
      seededFor.current = null;
      return;
    }
    if (seededFor.current === instrument) return;
    seededFor.current = instrument;
    setSelectedContract(data.contractName);
    setCustomPremium(data.recommendedPremium.toFixed(2));
  }, [data, instrument]);

  const premium = parseFloat(customPremium) || (data?.recommendedPremium ?? 0);
  const lotSize = cfg.lotSize;
  const totalQty = manualLots * lotSize;
  const capitalInvested = Math.round(totalQty * premium);
  const maxLoss = Math.round(capitalInvested * 0.2); // -20% SL cap
  const lossPct = tradingCapital > 0 ? ((maxLoss / tradingCapital) * 100).toFixed(1) : "0.0";
  const tp1Profit = Math.round(totalQty * 0.5 * premium * 0.25); // +1.5R on 50% lots
  const tp2Profit = Math.round(totalQty * 0.75 * premium * 0.5); // +2.5R on 75% lots
  const tp3Profit = Math.round(totalQty * premium * 0.76); // >3.5R on 100% lots
  const maxBudget = Math.round(tradingCapital * (riskPct / 100));

  const handleSelectStrike = (strike: number, type: "CE" | "PE", ltp: number) => {
    const clean = instrument.replace(/[^A-Z0-9]/g, "");
    setSelectedContract(`${clean} ${strike} ${type}`);
    setCustomPremium(ltp.toFixed(2));
    toast.success(`Selected ${clean} ${strike} ${type} @ ₹${ltp.toFixed(2)}`);
  };

  return {
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
    handleSelectStrike,
  };
}

export type OptionCalculatorState = ReturnType<typeof useOptionCalculator>;
