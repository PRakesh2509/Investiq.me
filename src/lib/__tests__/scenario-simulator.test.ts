import test from "node:test";
import assert from "node:assert/strict";
import {
  simulateStrategyScenarios,
  calculateOptionCharges,
  type OptionLeg,
} from "../scenario-simulator.ts";

test("calculateOptionCharges applies standard Indian exchange rates and ₹20 brokerage", () => {
  const buyTurnover = 150 * 75; // ₹11,250
  const sellTurnover = 180 * 75; // ₹13,500
  const charges = calculateOptionCharges(buyTurnover, sellTurnover, 2);

  // Brokerage: 2 orders * ₹20 = ₹40
  assert.equal(charges.brokerage, 40);
  // STT: 0.125% of sell premium turnover (13,500 * 0.00125 = 16.875 ~ 16.88)
  assert.equal(charges.stt, 16.88);
  // Total charges should be positive and realistic (~₹60 - ₹80)
  assert.ok(charges.totalCharges > 50 && charges.totalCharges < 100);
});

test("simulateStrategyScenarios evaluates 6 stress-test scenarios for long call", () => {
  const legs: OptionLeg[] = [
    {
      id: "leg-1",
      strike: 25000,
      type: "CE",
      action: "BUY",
      quantity: 75,
      entryPrice: 191,
      currentPrice: 191,
      iv: 15.0,
    },
  ];

  const report = simulateStrategyScenarios(
    "NIFTY 25000 CE",
    legs,
    25000, // Spot
    7, // 7 days to expiry
    75, // Lot size
  );

  assert.equal(report.scenarios.length, 6);
  assert.ok(report.aggregateGreeks.netDelta > 0.45 * 75, "Long call delta should be positive");
  assert.ok(report.aggregateGreeks.netThetaPerDay < 0, "Long call theta should be negative (decaying)");

  // Scenario 1: Bullish move (+1.5%) should produce positive net P&L
  const bullScen = report.scenarios.find((s) => s.scenario.id === "bullish_thrust");
  assert.ok(bullScen);
  assert.ok(bullScen.netPnl > 0, `Bullish net P&L was ${bullScen.netPnl}`);

  // Scenario 2: Bearish move (-1.5%) should produce negative net P&L
  const bearScen = report.scenarios.find((s) => s.scenario.id === "bearish_breakdown");
  assert.ok(bearScen);
  assert.ok(bearScen.netPnl < 0, `Bearish net P&L was ${bearScen.netPnl}`);

  // Scenario 3: Sideways decay (T+1) should lose value to theta
  const decayScen = report.scenarios.find((s) => s.scenario.id === "theta_bleed");
  assert.ok(decayScen);
  assert.ok(decayScen.netPnl < 0, `Decay net P&L was ${decayScen.netPnl}`);
});

test("simulateStrategyScenarios aggregates Greeks for Bull Call Spread correctly", () => {
  const legs: OptionLeg[] = [
    {
      id: "leg-buy",
      strike: 25000,
      type: "CE",
      action: "BUY",
      quantity: 75,
      entryPrice: 150,
      currentPrice: 150,
      iv: 15.0,
    },
    {
      id: "leg-sell",
      strike: 25100,
      type: "CE",
      action: "SELL",
      quantity: 75,
      entryPrice: 95,
      currentPrice: 95,
      iv: 14.8,
    },
  ];

  const report = simulateStrategyScenarios(
    "NIFTY Bull Call Spread",
    legs,
    25000,
    7,
    75,
  );

  // Vertical spread has lower net delta than single call
  assert.ok(report.aggregateGreeks.netDelta > 0);
  assert.ok(report.aggregateGreeks.netDelta < 0.5 * 75);
  // Net theta decay is partially hedged
  assert.ok(report.aggregateGreeks.netThetaPerDay > -500);
  // Max loss is limited to net debit (150 - 95) * 75 = 4125
  assert.equal(report.maxLoss, -4125);
});
