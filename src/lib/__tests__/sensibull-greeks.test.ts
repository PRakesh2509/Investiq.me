import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fetchSensibullGreeksChartData } from "../sensibull.server.ts";

describe("Sensibull Greeks View Chart Service", () => {
  test("Fetches structured Greek View Chart points across 21 strikes", async () => {
    const data = await fetchSensibullGreeksChartData("NIFTY 50");

    assert.ok(data, "Must return chart data object");
    assert.equal(data.symbol, "NIFTY50");
    assert.ok(data.underlyingPrice > 10000, "Underlying price must be valid");
    assert.ok(data.points.length >= 21, "Must generate at least 21 strike points across curve");

    // Check ATM point
    const atm = data.points.find((p) => p.isAtm);
    assert.ok(atm, "Must identify ATM strike");
    assert.ok(atm.callDelta >= 0.40 && atm.callDelta <= 0.60, `ATM Call delta should be ~0.50, got ${atm.callDelta}`);
    assert.ok(atm.putDelta >= -0.60 && atm.putDelta <= -0.40, `ATM Put delta should be ~-0.50, got ${atm.putDelta}`);

    // Check Gamma peak at ATM
    assert.ok(data.summary.peakGamma > 0, "Peak Gamma must be greater than zero");
    assert.ok(data.summary.maxThetaBurn > 0, "Max Theta burn must be greater than zero");

    // Check monotonic Delta progression (Call Delta decreases as strike increases)
    const firstCallDelta = data.points[0].callDelta;
    const lastCallDelta = data.points[data.points.length - 1].callDelta;
    assert.ok(firstCallDelta > lastCallDelta, "Deep ITM Call Delta must exceed deep OTM Call Delta");
  });

  test("Correctly supports Bank Nifty strike step (100 pts)", async () => {
    const data = await fetchSensibullGreeksChartData("BANK NIFTY");
    assert.equal(data.symbol, "BANKNIFTY");
    assert.ok(data.points.length >= 21);
    const stepDiff = Math.abs(data.points[1].strike - data.points[0].strike);
    assert.equal(stepDiff, 100, `Bank Nifty step diff should be 100, got ${stepDiff}`);
  });
});
