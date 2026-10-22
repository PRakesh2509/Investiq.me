import test from "node:test";
import assert from "node:assert/strict";
import { runStrategyBacktestValidation } from "../strategy-backtest.ts";

test("runStrategyBacktestValidation compares all 4 model baselines", () => {
  const report = runStrategyBacktestValidation("NIFTY 50", 250);

  assert.equal(report.models.length, 4);

  const [tech, greeks, news, unified] = report.models;

  // Verify model names
  assert.equal(tech.modelId, "TECHNICAL_ONLY");
  assert.equal(greeks.modelId, "GREEKS_AWARE");
  assert.equal(news.modelId, "NEWS_AWARE");
  assert.equal(unified.modelId, "UNIFIED_MODEL");

  // Statistical progression: Win rate and Profit factor should reflect empirical findings
  assert.ok(greeks.winRatePct > tech.winRatePct, "Greeks awareness should improve win rate over pure technicals");
  assert.ok(unified.profitFactor > tech.profitFactor, "Unified model should achieve higher profit factor");
  assert.ok(unified.maxDrawdownPct < tech.maxDrawdownPct, "Unified model with risk gates should reduce drawdown");

  // Brier score: Lower is better calibrated
  assert.ok(unified.brierCalibrationScore < tech.brierCalibrationScore, "Unified model has superior Brier calibration");

  // Verify comparative insights are provided
  assert.ok(report.comparativeInsight.honestEvidenceSummary.length > 0);
  assert.ok(report.comparativeInsight.unifiedAlphaConclusion.length > 0);
});
