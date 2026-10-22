/**
 * Continuous F&O Engine Server Functions (`fnoContinuousEngine`)
 *
 * Implements Phase 8: Unified server functions for real-time frontend streaming.
 * Connects all 8 core services and provides continuous analytical updates.
 */

import { createServerFn } from "@tanstack/react-start";
import {
  fnoMarketDataService,
  optionsGreeksDataService,
  greeksAnalysisService,
  fnoSignalAnalysisService,
  tradeCandidateService,
  tradingSessionService,
  type FnoMarketSnapshot,
  type SynchronizedGreeksSnapshot,
  type GreeksAnalysisReport,
  type CombinedFnoAnalysisReport,
  type CandidateGenerationResult,
  type TradingSessionInfo,
} from "./services/index.ts";

export interface ContinuousFnoData {
  session: TradingSessionInfo;
  snapshot: FnoMarketSnapshot;
  greeks: SynchronizedGreeksSnapshot;
  greeksReport: GreeksAnalysisReport;
  analysis: CombinedFnoAnalysisReport;
  candidatesResult: CandidateGenerationResult;
  timestamp: string;
}

/**
 * Get unified real-time continuous F&O + Options Greeks intelligence
 */
export const getContinuousFnoIntelligence = createServerFn({ method: "POST" })
  .validator(
    (d: {
      instrument?: string;
      expiry?: string;
      accountCapital?: number;
      maxRiskPerTradePct?: number;
    }) => d
  )
  .handler(async ({ data }): Promise<ContinuousFnoData> => {
    const instrument = data.instrument || "NIFTY 50";
    const expiry = data.expiry;
    const capital = data.accountCapital ?? 30000;
    const riskPct = data.maxRiskPerTradePct ?? 2.0;

    const session = tradingSessionService.getSessionInfo();
    const snapshot = await fnoMarketDataService.getMarketSnapshot(instrument, expiry);
    const greeks = await optionsGreeksDataService.getGreeksSnapshot(instrument, expiry);
    const greeksReport = greeksAnalysisService.analyzeGreeks(greeks);
    const analysis = fnoSignalAnalysisService.analyzeCombinedSignal(snapshot, greeksReport);

    const candidatesResult = tradeCandidateService.evaluateCandidates(
      snapshot,
      greeksReport,
      analysis,
      capital,
      riskPct
    );

    return {
      session,
      snapshot,
      greeks,
      greeksReport,
      analysis,
      candidatesResult,
      timestamp: new Date().toISOString(),
    };
  });
