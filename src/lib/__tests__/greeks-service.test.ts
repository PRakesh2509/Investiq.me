import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGreeks,
  calculateImpliedVolatility,
  normalCdf,
  normalPdf,
} from "../greeks-service.ts";

test("normalCdf produces accurate standard normal distribution values", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-4);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
  assert.equal(normalCdf(10), 1);
  assert.equal(normalCdf(-10), 0);
});

test("calculateGreeks returns valid Black-Scholes Greeks for ATM Call", () => {
  const res = calculateGreeks({
    spot: 25000,
    strike: 25000,
    timeToExpiryYears: 30 / 365,
    volatility: 0.15,
    riskFreeRate: 0.068,
    dividendYield: 0.012,
    type: "CE",
  });

  // Call Delta for ATM should be around ~0.52 (slightly above 0.5 due to r > q)
  assert.ok(res.delta > 0.45 && res.delta < 0.6, `Delta was ${res.delta}`);
  // Gamma must be strictly positive
  assert.ok(res.gamma > 0, `Gamma was ${res.gamma}`);
  // Theta for long call must be negative (decaying)
  assert.ok(res.theta < 0, `Theta was ${res.theta}`);
  // Vega must be positive
  assert.ok(res.vega > 0, `Vega was ${res.vega}`);
  // Price must be positive
  assert.ok(res.price > 0, `Price was ${res.price}`);
});

test("calculateGreeks returns valid Black-Scholes Greeks for ATM Put", () => {
  const res = calculateGreeks({
    spot: 25000,
    strike: 25000,
    timeToExpiryYears: 30 / 365,
    volatility: 0.15,
    riskFreeRate: 0.068,
    dividendYield: 0.012,
    type: "PE",
  });

  // Put Delta for ATM should be around ~ -0.48
  assert.ok(res.delta < -0.4 && res.delta > -0.6, `Put Delta was ${res.delta}`);
  // Gamma must be identical to Call Gamma
  assert.ok(res.gamma > 0, `Gamma was ${res.gamma}`);
  // Vega must be positive
  assert.ok(res.vega > 0, `Vega was ${res.vega}`);
  // Price must be positive
  assert.ok(res.price > 0, `Price was ${res.price}`);
});

test("Handles expiry-day near-zero time without NaN or crash", () => {
  const itmCall = calculateGreeks({
    spot: 25100,
    strike: 25000,
    timeToExpiryYears: 0.00005,
    volatility: 0.15,
    type: "CE",
  });
  assert.equal(itmCall.price, 100);
  assert.equal(itmCall.delta, 1);
  assert.equal(itmCall.timeValue, 0);

  const otmCall = calculateGreeks({
    spot: 24900,
    strike: 25000,
    timeToExpiryYears: 0.00005,
    volatility: 0.15,
    type: "CE",
  });
  assert.equal(otmCall.price, 0);
  assert.equal(otmCall.delta, 0);
});

test("Implied Volatility solver converges accurately", () => {
  const spot = 25000;
  const strike = 25000;
  const T = 15 / 365;
  const targetIv = 0.18; // 18%

  const theoretical = calculateGreeks({
    spot,
    strike,
    timeToExpiryYears: T,
    volatility: targetIv,
    type: "CE",
  });

  const solvedIv = calculateImpliedVolatility(theoretical.price, spot, strike, T, "CE");
  assert.ok(Math.abs(solvedIv - 18.0) < 0.25, `Solved IV was ${solvedIv}% vs target 18%`);
});
