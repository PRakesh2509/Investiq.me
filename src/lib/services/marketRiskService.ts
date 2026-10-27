/**
 * Market Risk Service (`marketRiskService`)
 *
 * Implements Phase 5: Independent Hard Risk Management Gates.
 * Evaluates candidate trade setups against capital constraints, contract lot sizes,
 * liquidity / spread limits, regulatory taxes, brokerage, slippage, and expiry risks.
 *
 * HARD PRINCIPLE:
 * A high AI or technical score NEVER overrides a failed risk check.
 */

import { WORKSTATION_INSTRUMENTS } from "../terminal-workstation.functions.ts";
import { tradingSessionService } from "./tradingSessionService.ts";

export interface RiskCheckItem {
  id: string;
  name: string;
  passed: boolean;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  rule: string;
  observedValue: string;
  mitigation: string;
}

export interface RiskEvaluationInput {
  instrument: string;
  strategy: string;
  strike: number;
  entryPremium: number;
  stopLossPremium: number;
  targetPremium: number;
  lots: number;
  bidAskSpreadPct: number;
  daysToExpiry: number;
  accountCapital: number;
  maxRiskPerTradePct?: number; // default 2%
  isHighMacroEventRisk?: boolean;
}

export interface TransactionCostBreakdown {
  brokerage: number; // Flat ₹20 per executed leg
  stt: number; // 0.0625% on sell side option premium
  exchangeTurnoverFee: number; // 0.05% on premium turnover
  gst: number; // 18% on (Brokerage + Txn fees)
  sebiCharges: number; // ₹10 per crore (0.0001%)
  stampDuty: number; // 0.003% on buy value
  estimatedSlippage: number; // 0.3% of premium
  totalEstimatedCost: number;
}

export interface RiskEvaluationReport {
  passed: boolean;
  riskChecks: RiskCheckItem[];
  failedCriticalCount: number;
  capitalAtRisk: number;
  maxAllowedRiskBudget: number;
  transactionCosts: TransactionCostBreakdown;
  netRiskRewardRatio: number;
  capitalAllocatedPct: number;
  verdict: "APPROVED_WITHIN_RISK_GATES" | "REJECTED_RISK_GATE_FAILURE";
  rejectionReasons: string[];
}

export class MarketRiskService {
  /**
   * Compute realistic Indian F&O regulatory and broker transaction costs
   */
  public calculateTransactionCosts(
    premium: number,
    lotSize: number,
    lots: number,
    isSpread: boolean = false,
  ): TransactionCostBreakdown {
    const totalShares = lots * lotSize;
    const premiumTurnover = premium * totalShares;
    const legsCount = isSpread ? 2 : 1;

    // 1. Brokerage: ₹20 per order/leg (Standard discount broker e.g., Zerodha/Dhan/Groww)
    const brokerage = 20 * legsCount * 2; // entry + exit

    // 2. STT (Securities Transaction Tax): 0.0625% on sell premium
    const stt = +(premiumTurnover * 0.000625).toFixed(2);

    // 3. Exchange Turnover Fee (NSE Options): ~0.05% on premium turnover
    const exchangeTurnoverFee = +(premiumTurnover * 0.0005).toFixed(2);

    // 4. GST: 18% on (Brokerage + Exchange turnover fees)
    const gst = +((brokerage + exchangeTurnoverFee) * 0.18).toFixed(2);

    // 5. SEBI turnover charges: ₹10 per crore
    const sebiCharges = +(premiumTurnover * 0.000001).toFixed(2);

    // 6. Stamp duty: 0.003% on buy order value
    const stampDuty = +(premiumTurnover * 0.00003).toFixed(2);

    // 7. Realistic slippage buffer (0.3% on premium)
    const estimatedSlippage = +(premiumTurnover * 0.003).toFixed(2);

    const totalEstimatedCost = +(
      brokerage +
      stt +
      exchangeTurnoverFee +
      gst +
      sebiCharges +
      stampDuty +
      estimatedSlippage
    ).toFixed(2);

    return {
      brokerage,
      stt,
      exchangeTurnoverFee,
      gst,
      sebiCharges,
      stampDuty,
      estimatedSlippage,
      totalEstimatedCost,
    };
  }

  /**
   * Evaluate independent hard risk checks
   */
  public evaluateRisk(input: RiskEvaluationInput): RiskEvaluationReport {
    const checks: RiskCheckItem[] = [];
    const rejectionReasons: string[] = [];

    const cfg = WORKSTATION_INSTRUMENTS[input.instrument];
    if (!cfg) {
      throw new Error(`Unknown instrument: ${input.instrument}`);
    }
    const lotSize = cfg.lotSize;
    const maxRiskPct = input.maxRiskPerTradePct ?? 2.0;
    const maxAllowedRiskBudget = Math.round(input.accountCapital * (maxRiskPct / 100));

    const isSpread = input.strategy.includes("SPREAD");
    const costs = this.calculateTransactionCosts(input.entryPremium, lotSize, input.lots, isSpread);

    const totalQty = input.lots * lotSize;
    const perShareRisk = Math.max(0.1, input.entryPremium - input.stopLossPremium);
    const capitalAtRisk = Math.round(perShareRisk * totalQty + costs.totalEstimatedCost);
    const capitalAllocated = Math.round(input.entryPremium * totalQty);
    const capitalAllocatedPct = +(
      input.accountCapital > 0 ? (capitalAllocated / input.accountCapital) * 100 : 0
    ).toFixed(1);

    // 1. Capital Preservation Gate (Max ₹ at risk vs Budget)
    const capitalPassed = capitalAtRisk <= maxAllowedRiskBudget * 1.05; // 5% tolerance
    checks.push({
      id: "CAPITAL_BUDGET",
      name: "Risk Budget Enforcement",
      passed: capitalPassed,
      severity: "CRITICAL",
      rule: `Max loss (₹${capitalAtRisk.toLocaleString("en-IN")}) must not exceed ${maxRiskPct}% risk budget (₹${maxAllowedRiskBudget.toLocaleString("en-IN")})`,
      observedValue: `₹${capitalAtRisk.toLocaleString("en-IN")}`,
      mitigation: "Reduce lot count or select a tighter stop-loss strike",
    });
    if (!capitalPassed) {
      rejectionReasons.push(
        `Risk amount ₹${capitalAtRisk} exceeds maximum risk budget of ₹${maxAllowedRiskBudget}`,
      );
    }

    // 2. Bid-Ask Spread Cap (Illiquidity Gate)
    const spreadPassed = input.bidAskSpreadPct <= 2.5;
    checks.push({
      id: "BID_ASK_SPREAD",
      name: "Bid-Ask Spread Cap",
      passed: spreadPassed,
      severity: "CRITICAL",
      rule: "Bid-Ask spread must not exceed 2.5% to prevent excessive execution slippage",
      observedValue: `${input.bidAskSpreadPct.toFixed(2)}%`,
      mitigation: "Avoid illiquid OTM strikes; focus on ATM or liquid monthly series",
    });
    if (!spreadPassed) {
      rejectionReasons.push(
        `Bid-ask spread (${input.bidAskSpreadPct.toFixed(2)}%) exceeds liquidity threshold (2.5%)`,
      );
    }

    // 3. Expiry Afternoon Decay Trap Check
    const session = tradingSessionService.getSessionInfo(undefined, input.instrument);
    const isExpiryDay = input.daysToExpiry <= 0.5;
    const isExpiryAfternoonNaked = isExpiryDay && session.isExpiryAfternoon && !isSpread;
    const expiryPassed = !isExpiryAfternoonNaked;

    checks.push({
      id: "EXPIRY_AFTERNOON_TRAP",
      name: "Zero-DTE Afternoon Theta Gate",
      passed: expiryPassed,
      severity: "CRITICAL",
      rule: "Naked long options are barred after 1:30 PM on expiry day due to terminal theta decay",
      observedValue: `${input.daysToExpiry.toFixed(2)} DTE`,
      mitigation: "Deploy defined-risk vertical debit/credit spreads or roll to next weekly cycle",
    });
    if (!expiryPassed) {
      rejectionReasons.push(
        "Naked long options are prohibited on expiry day afternoon due to extreme theta burn",
      );
    }

    // 4. Macro / Geopolitical High-Risk Gate
    const macroPassed = !input.isHighMacroEventRisk || isSpread;
    checks.push({
      id: "EVENT_RISK_GATE",
      name: "High-Impact Event Gate",
      passed: macroPassed,
      severity: "HIGH",
      rule: "Naked directional exposure prohibited during active high-impact macroeconomic event risk",
      observedValue:
        input.isHighMacroEventRisk === undefined
          ? "NOT_EVALUATED (no event-risk feed supplied)"
          : input.isHighMacroEventRisk
            ? "HIGH_EVENT_RISK"
            : "NORMAL",
      mitigation: "Use hedged spread structures or stay in cash until post-event resolution",
    });
    if (!macroPassed) {
      rejectionReasons.push(
        "Active high-impact event risk blocks fresh unhedged directional trades",
      );
    }

    // Net Risk/Reward after transaction costs
    const perShareReward = Math.max(0.1, input.targetPremium - input.entryPremium);
    const grossProfit = perShareReward * totalQty;
    const netProfit = Math.max(0, grossProfit - costs.totalEstimatedCost);
    const netRiskRewardRatio = +(capitalAtRisk > 0 ? netProfit / capitalAtRisk : 0).toFixed(2);

    const rrPassed = netRiskRewardRatio >= 1.25;
    checks.push({
      id: "NET_RISK_REWARD",
      name: "Net Risk-Reward Threshold",
      passed: rrPassed,
      severity: "HIGH",
      rule: "Net Risk/Reward ratio after full transaction costs must be >= 1:1.25",
      observedValue: `1:${netRiskRewardRatio}`,
      mitigation: "Seek wider profit target or tighter entry zone",
    });
    if (!rrPassed) {
      rejectionReasons.push(
        `Net R:R after costs (1:${netRiskRewardRatio}) falls below minimum threshold (1:1.25)`,
      );
    }

    const failedCriticalCount = checks.filter((c) => !c.passed && c.severity === "CRITICAL").length;
    const passed = failedCriticalCount === 0 && rejectionReasons.length === 0;

    return {
      passed,
      riskChecks: checks,
      failedCriticalCount,
      capitalAtRisk,
      maxAllowedRiskBudget,
      transactionCosts: costs,
      netRiskRewardRatio,
      capitalAllocatedPct: Number(capitalAllocatedPct),
      verdict: passed ? "APPROVED_WITHIN_RISK_GATES" : "REJECTED_RISK_GATE_FAILURE",
      rejectionReasons,
    };
  }
}

export const marketRiskService = new MarketRiskService();
