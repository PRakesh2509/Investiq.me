/**
 * Scenario Simulator & Greeks Sensitivity Engine (Phase 6)
 *
 * Simulates multi-scenario option P&L under simultaneous changes in:
 * - Spot price (directional moves and gap shocks)
 * - Implied Volatility (expansion, contraction, event crush)
 * - Time decay (calendar days elapsed)
 * - Execution slippage and statutory transaction costs (Indian market rates: STT, GST, Stamp Duty, Brokerage)
 *
 * Supports single-leg options and multi-leg spreads with exact position Greeks aggregation.
 */

import { calculateGreeks } from "./greeks-service.ts";

export interface OptionLeg {
  id: string;
  strike: number;
  type: "CE" | "PE";
  action: "BUY" | "SELL";
  quantity: number; // Positive integer lots * lotSize
  entryPrice: number;
  currentPrice: number;
  iv: number; // Implied Volatility in percentage (e.g. 15.5)
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  spotChangePct: number; // e.g. +1.5 for +1.5%
  ivChangePctPoints: number; // e.g. +3.0 for +3% points (e.g. 15% -> 18%)
  daysElapsed: number; // e.g. 1 for next-day carry
  slippagePct?: number; // Exit slippage assumption (default 0.25%)
}

export interface StatutoryTaxesAndCharges {
  brokerage: number; // ₹20 flat per executed order
  stt: number; // Securities Transaction Tax (0.125% on sell-side option premium)
  exchangeTurnoverCharge: number; // 0.0505% of premium turnover
  gst: number; // 18% on (brokerage + exchange turnover charge)
  stampDuty: number; // 0.003% on buy-side turnover
  sebiFee: number; // ₹10 per crore (0.0001%)
  totalCharges: number;
}

export interface ScenarioLegResult {
  legId: string;
  strike: number;
  type: "CE" | "PE";
  action: "BUY" | "SELL";
  quantity: number;
  originalPrice: number;
  newPrice: number;
  priceChange: number;
  grossPnl: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface GreeksAttribution {
  deltaPnl: number;
  gammaPnl: number;
  thetaPnl: number;
  vegaPnl: number;
  higherOrderPnl: number;
}

export interface ScenarioSimulationResult {
  scenario: ScenarioDefinition;
  simulatedSpot: number;
  simulatedDaysToExpiry: number;
  legs: ScenarioLegResult[];
  grossPnl: number;
  estimatedCharges: StatutoryTaxesAndCharges;
  netPnl: number;
  netPnlPct: number;
  greeksAttribution: GreeksAttribution;
  positionGreeks: {
    netDelta: number;
    netGamma: number;
    netThetaPerDay: number;
    netVegaPerPoint: number;
  };
}

export interface StrategyScenarioReport {
  strategyName: string;
  underlyingSpot: number;
  daysToExpiry: number;
  riskFreeRate: number;
  dividendYield: number;
  lotSize: number;
  legs: OptionLeg[];
  aggregateGreeks: {
    netDelta: number;
    netGamma: number;
    netThetaPerDay: number;
    netVegaPerPoint: number;
  };
  maxProfit: number | "UNLIMITED";
  maxLoss: number | "UNLIMITED";
  breakevenPoints: number[];
  scenarios: ScenarioSimulationResult[];
  timestamp: string;
}

/**
 * Calculate Indian Exchange statutory taxes and brokerage for option trading
 */
export function calculateOptionCharges(
  buyPremiumTurnover: number,
  sellPremiumTurnover: number,
  ordersCount = 2,
): StatutoryTaxesAndCharges {
  // Flat ₹20 per executed order (discount broker standard like Dhan / Zerodha)
  const brokerage = ordersCount * 20;

  // STT on options: 0.125% on sell side premium turnover
  const stt = +(sellPremiumTurnover * 0.00125).toFixed(2);

  // Exchange turnover fee: ~0.0505% on total turnover
  const totalTurnover = buyPremiumTurnover + sellPremiumTurnover;
  const exchangeTurnoverCharge = +(totalTurnover * 0.000505).toFixed(2);

  // GST: 18% on (Brokerage + Exchange turnover)
  const gst = +((brokerage + exchangeTurnoverCharge) * 0.18).toFixed(2);

  // Stamp duty: 0.003% on buy side only
  const stampDuty = +(buyPremiumTurnover * 0.00003).toFixed(2);

  // SEBI turnover charges: ₹10 per crore (0.0001%)
  const sebiFee = +(totalTurnover * 0.000001).toFixed(2);

  const totalCharges = +(brokerage + stt + exchangeTurnoverCharge + gst + stampDuty + sebiFee).toFixed(2);

  return {
    brokerage,
    stt,
    exchangeTurnoverCharge,
    gst,
    stampDuty,
    sebiFee,
    totalCharges,
  };
}

/**
 * Standard Institutional Stress-Test Scenarios (Phase 6 requirement)
 */
export const DEFAULT_STRESS_SCENARIOS: ScenarioDefinition[] = [
  {
    id: "bullish_thrust",
    name: "Bullish Move (+1.5%)",
    description: "Spot rallies +1.5%, IV softens -1.0% with no overnight decay",
    spotChangePct: 1.5,
    ivChangePctPoints: -1.0,
    daysElapsed: 0,
    slippagePct: 0.2,
  },
  {
    id: "bearish_breakdown",
    name: "Bearish Drop (-1.5%)",
    description: "Spot drops -1.5%, IV expands +2.0% due to hedging pressure",
    spotChangePct: -1.5,
    ivChangePctPoints: 2.0,
    daysElapsed: 0,
    slippagePct: 0.25,
  },
  {
    id: "theta_bleed",
    name: "Sideways Decay (T+1 Day)",
    description: "Spot flat (0.0%), IV eases -1.5%, 1 full calendar day decay",
    spotChangePct: 0.0,
    ivChangePctPoints: -1.5,
    daysElapsed: 1,
    slippagePct: 0.15,
  },
  {
    id: "vol_expansion_shock",
    name: "Macro Event Vol Spike (+4% IV)",
    description: "Geopolitical tension or RBI unexpected rate move: Spot -1.0%, IV +4.0%",
    spotChangePct: -1.0,
    ivChangePctPoints: 4.0,
    daysElapsed: 0.5,
    slippagePct: 0.35,
  },
  {
    id: "event_iv_crush",
    name: "Post-Event IV Crush (-5% IV)",
    description: "Post-announcement calm: Spot +0.5%, IV drops -5.0%, T+1 day decay",
    spotChangePct: 0.5,
    ivChangePctPoints: -5.0,
    daysElapsed: 1,
    slippagePct: 0.2,
  },
  {
    id: "tail_risk_gap",
    name: "Overnight Gap Down (-2.5%)",
    description: "Global market gap down: Spot -2.5%, IV +6.0%, T+1 day with wider 0.5% slippage",
    spotChangePct: -2.5,
    ivChangePctPoints: 6.0,
    daysElapsed: 1,
    slippagePct: 0.5,
  },
];

/**
 * Execute Full Greeks-Aware Strategy Evaluation (Phase 6)
 */
export function simulateStrategyScenarios(
  strategyName: string,
  legs: OptionLeg[],
  underlyingSpot: number,
  daysToExpiry: number,
  lotSize: number,
  customScenarios: ScenarioDefinition[] = DEFAULT_STRESS_SCENARIOS,
  riskFreeRate = 0.068,
  dividendYield = 0.012,
): StrategyScenarioReport {
  // 1. Calculate baseline Greeks for each leg
  const baseLegGreeks = legs.map((leg) => {
    const timeYears = Math.max(0.0001, daysToExpiry / 365);
    const vol = Math.max(0.01, leg.iv / 100);
    const greeks = calculateGreeks({
      spot: underlyingSpot,
      strike: leg.strike,
      timeToExpiryYears: timeYears,
      volatility: vol,
      riskFreeRate,
      dividendYield,
      type: leg.type,
    });
    return {
      leg,
      greeks,
    };
  });

  // Aggregate current position Greeks
  let netDelta = 0;
  let netGamma = 0;
  let netThetaPerDay = 0;
  let netVegaPerPoint = 0;

  for (const { leg, greeks } of baseLegGreeks) {
    const sign = leg.action === "BUY" ? 1 : -1;
    netDelta += sign * greeks.delta * leg.quantity;
    netGamma += sign * greeks.gamma * leg.quantity;
    netThetaPerDay += sign * greeks.theta * leg.quantity;
    netVegaPerPoint += sign * greeks.vega * leg.quantity;
  }

  // 2. Evaluate Scenarios
  const scenarioResults: ScenarioSimulationResult[] = customScenarios.map((scen) => {
    const newSpot = +(underlyingSpot * (1 + scen.spotChangePct / 100)).toFixed(2);
    const remainingDays = Math.max(0.0001, daysToExpiry - scen.daysElapsed);
    const remainingTimeYears = remainingDays / 365;

    let scenarioGrossPnl = 0;
    let buyExitTurnover = 0;
    let sellExitTurnover = 0;

    let scenNetDelta = 0;
    let scenNetGamma = 0;
    let scenNetTheta = 0;
    let scenNetVega = 0;

    const legResults: ScenarioLegResult[] = legs.map((leg) => {
      const newIvPct = Math.max(1, leg.iv + scen.ivChangePctPoints);
      const newVol = newIvPct / 100;

      const repriced = calculateGreeks({
        spot: newSpot,
        strike: leg.strike,
        timeToExpiryYears: remainingTimeYears,
        volatility: newVol,
        riskFreeRate,
        dividendYield,
        type: leg.type,
      });

      // Apply exit slippage
      const slippageRate = (scen.slippagePct ?? 0.25) / 100;
      let effectiveExitPrice = repriced.price;
      if (leg.action === "BUY") {
        // Exiting long position = Selling -> slippage reduces exit price
        effectiveExitPrice = Math.max(0.05, +(repriced.price * (1 - slippageRate)).toFixed(2));
        sellExitTurnover += effectiveExitPrice * leg.quantity;
      } else {
        // Exiting short position = Buying back -> slippage increases buyback price
        effectiveExitPrice = +(repriced.price * (1 + slippageRate)).toFixed(2);
        buyExitTurnover += effectiveExitPrice * leg.quantity;
      }

      const priceDiff = effectiveExitPrice - leg.entryPrice;
      const legPnl = +(
        (leg.action === "BUY" ? priceDiff : -priceDiff) * leg.quantity
      ).toFixed(2);

      scenarioGrossPnl += legPnl;

      const sign = leg.action === "BUY" ? 1 : -1;
      scenNetDelta += sign * repriced.delta * leg.quantity;
      scenNetGamma += sign * repriced.gamma * leg.quantity;
      scenNetTheta += sign * repriced.theta * leg.quantity;
      scenNetVega += sign * repriced.vega * leg.quantity;

      return {
        legId: leg.id,
        strike: leg.strike,
        type: leg.type,
        action: leg.action,
        quantity: leg.quantity,
        originalPrice: leg.entryPrice,
        newPrice: effectiveExitPrice,
        priceChange: +(effectiveExitPrice - leg.entryPrice).toFixed(2),
        grossPnl: legPnl,
        delta: repriced.delta,
        gamma: repriced.gamma,
        theta: repriced.theta,
        vega: repriced.vega,
      };
    });

    // Calculate realistic transaction costs on exit
    const exitCharges = calculateOptionCharges(buyExitTurnover, sellExitTurnover, legs.length);
    const netPnl = +(scenarioGrossPnl - exitCharges.totalCharges).toFixed(2);

    // Initial total capital outlay (for Long options) or margin baseline
    const totalOutlay = legs.reduce((acc, l) => {
      return l.action === "BUY" ? acc + l.entryPrice * l.quantity : acc + 100000;
    }, 0);
    const netPnlPct = totalOutlay > 0 ? +((netPnl / totalOutlay) * 100).toFixed(2) : 0;

    // Greeks Attribution Decomposition:
    // Delta P&L = Net Delta * ΔSpot
    // Gamma P&L = 0.5 * Net Gamma * (ΔSpot)^2
    // Theta P&L = Net Theta * ΔDays
    // Vega P&L = Net Vega * ΔIV (in % pts)
    const deltaSpot = newSpot - underlyingSpot;
    const deltaPnl = +(netDelta * deltaSpot).toFixed(2);
    const gammaPnl = +(0.5 * netGamma * deltaSpot * deltaSpot).toFixed(2);
    const thetaPnl = +(netThetaPerDay * scen.daysElapsed).toFixed(2);
    const vegaPnl = +(netVegaPerPoint * scen.ivChangePctPoints).toFixed(2);
    const higherOrderPnl = +(scenarioGrossPnl - (deltaPnl + gammaPnl + thetaPnl + vegaPnl)).toFixed(2);

    return {
      scenario: scen,
      simulatedSpot: newSpot,
      simulatedDaysToExpiry: +remainingDays.toFixed(2),
      legs: legResults,
      grossPnl: +scenarioGrossPnl.toFixed(2),
      estimatedCharges: exitCharges,
      netPnl,
      netPnlPct,
      greeksAttribution: {
        deltaPnl,
        gammaPnl,
        thetaPnl,
        vegaPnl,
        higherOrderPnl,
      },
      positionGreeks: {
        netDelta: +scenNetDelta.toFixed(3),
        netGamma: +scenNetGamma.toFixed(5),
        netThetaPerDay: +scenNetTheta.toFixed(2),
        netVegaPerPoint: +scenNetVega.toFixed(2),
      },
    };
  });

  // Calculate Breakeven and Max Risk/Profit
  let maxProfit: number | "UNLIMITED" = 0;
  let maxLoss: number | "UNLIMITED" = 0;
  const breakevens: number[] = [];

  if (legs.length === 1 && legs[0].action === "BUY") {
    // Single Long Call or Put
    const leg = legs[0];
    const totalDebit = leg.entryPrice * leg.quantity;
    maxLoss = -totalDebit;
    maxProfit = "UNLIMITED";
    if (leg.type === "CE") {
      breakevens.push(+(leg.strike + leg.entryPrice).toFixed(2));
    } else {
      breakevens.push(+(leg.strike - leg.entryPrice).toFixed(2));
    }
  } else if (legs.length === 2) {
    // Check if vertical spread
    const buyLeg = legs.find((l) => l.action === "BUY");
    const sellLeg = legs.find((l) => l.action === "SELL");
    if (buyLeg && sellLeg && buyLeg.type === sellLeg.type) {
      const netDebit = (buyLeg.entryPrice - sellLeg.entryPrice) * buyLeg.quantity;
      const strikeDiff = Math.abs(buyLeg.strike - sellLeg.strike) * buyLeg.quantity;
      if (netDebit > 0) {
        // Debit spread
        maxLoss = -netDebit;
        maxProfit = +(strikeDiff - netDebit).toFixed(2);
        if (buyLeg.type === "CE") {
          breakevens.push(+(buyLeg.strike + netDebit / buyLeg.quantity).toFixed(2));
        } else {
          breakevens.push(+(buyLeg.strike - netDebit / buyLeg.quantity).toFixed(2));
        }
      }
    }
  }

  return {
    strategyName,
    underlyingSpot,
    daysToExpiry,
    riskFreeRate,
    dividendYield,
    lotSize,
    legs,
    aggregateGreeks: {
      netDelta: +netDelta.toFixed(3),
      netGamma: +netGamma.toFixed(5),
      netThetaPerDay: +netThetaPerDay.toFixed(2),
      netVegaPerPoint: +netVegaPerPoint.toFixed(2),
    },
    maxProfit,
    maxLoss,
    breakevenPoints: breakevens,
    scenarios: scenarioResults,
    timestamp: new Date().toISOString(),
  };
}
