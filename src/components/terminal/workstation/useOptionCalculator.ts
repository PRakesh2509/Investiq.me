import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { InstrumentConfig, WorkstationData } from "./types";

/**
 * Option premium / risk calculator state.
 * All derived numbers are pure functions of real inputs.
 */
export function useOptionCalculator(
  instrument: string,
  data: WorkstationData | null,
  cfg: InstrumentConfig,
) {
  const [tradingCapital, setTradingCapital] = useState<number>(30000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [manualLots, setManualLots] = useState<number>(1);
  const [customPremium, setCustomPremium] = useState<string>("");
  const [selectedContract, setSelectedContract] = useState<string>("");

  // Seed the contract & live premium from the server payload
  useEffect(() => {
    if (!data) return;
    if (data.contractName && !selectedContract) {
      setSelectedContract(data.contractName);
    }
    if (data.recommendedPremium > 0 && !customPremium) {
      setCustomPremium(data.recommendedPremium.toFixed(2));
    }
  }, [data, selectedContract, customPremium]);

  // Section 6.2: Live premium from option chain; if custom is blank, use live recommendedPremium
  const liveLtp = data?.recommendedPremium && data.recommendedPremium > 0 ? data.recommendedPremium : 115.0;
  const premium = customPremium.trim() !== "" ? parseFloat(customPremium) || liveLtp : liveLtp;

  // Section 6.1: Dynamic lot size & budget
  const lotSize = data?.lotSize && data.lotSize > 0 ? data.lotSize : cfg.lotSize;
  const maxBudget = Math.round(tradingCapital * (riskPct / 100));

  // Recommended lots: largest whole number of lots whose premium * lotSize fits maxBudget
  const costPerLot = premium * lotSize;
  const recommendedLots = costPerLot > 0 ? Math.max(1, Math.floor(maxBudget / costPerLot)) : 1;

  // Active lots used for calculations
  const activeLots = manualLots > 0 ? manualLots : recommendedLots;
  const totalQty = activeLots * lotSize;
  const capitalInvested = Math.round(totalQty * premium);

  // Section 6.3:
  // - Max downside loss at -20% SL cap
  const maxLoss = Math.round(capitalInvested * 0.2);
  const lossPct = tradingCapital > 0 ? ((maxLoss / tradingCapital) * 100).toFixed(1) : "0.0";

  // - Profit locked at TP1 (50% qty at 1.5R = +30% gain)
  const tp1Profit = Math.round(totalQty * 0.5 * premium * 0.3);

  // - Return at TP2 (75% qty at 2.5R = +50% gain)
  const tp2Profit = Math.round(totalQty * 0.75 * premium * 0.5);

  // - Hero runner at TP3 (100% qty at >3.5R = +76% gain)
  const tp3Profit = Math.round(totalQty * premium * 0.76);

  // Section 6.4: Dynamic trailing SL engine
  const [peakWatermark, setPeakWatermark] = useState<number>(premium);
  useEffect(() => {
    if (premium > peakWatermark) setPeakWatermark(premium);
  }, [premium, peakWatermark]);

  const tp1Price = +(premium * 1.3).toFixed(2);
  const isTp1Hit = peakWatermark >= tp1Price;
  // When TP1 is hit, move SL to entry (breakeven)
  const trailingSl = isTp1Hit ? premium : +(premium * 0.8).toFixed(2);

  const handleSelectStrike = (strike: number, type: "CE" | "PE", ltp: number) => {
    const clean = instrument.replace(/[^A-Z0-9]/g, "");
    const contractName = `${clean} ${strike} ${type}`;
    setSelectedContract(contractName);
    setCustomPremium(ltp.toFixed(2));
    setPeakWatermark(ltp);
    toast.success(`Selected ${contractName} @ ₹${ltp.toFixed(2)}`);
  };

  return {
    tradingCapital,
    setTradingCapital,
    riskPct,
    setRiskPct,
    manualLots: activeLots,
    setManualLots,
    recommendedLots,
    customPremium,
    setCustomPremium,
    selectedContract: selectedContract || data?.contractName || `${cfg.tag} ATM CE`,
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
    handleSelectStrike,
  };
}

export type OptionCalculatorState = ReturnType<typeof useOptionCalculator>;
