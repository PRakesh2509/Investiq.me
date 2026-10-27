/**
 * Continuous F&O Engine Server Functions (`fnoContinuousEngine`)
 *
 * Implements Phase 8: Unified server functions for real-time frontend streaming.
 * Connects all core services and provides continuous analytical updates.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  type FnoAnalysisDataQuality,
} from "./services/index.ts";
import { WORKSTATION_INSTRUMENTS } from "./terminal-workstation.functions.ts";

export interface ContinuousFnoData {
  session: TradingSessionInfo;
  snapshot: FnoMarketSnapshot;
  greeks: SynchronizedGreeksSnapshot;
  greeksReport: GreeksAnalysisReport;
  analysis: CombinedFnoAnalysisReport;
  candidatesResult: CandidateGenerationResult;
  /** Which inputs were real / simulated / unavailable. */
  dataQuality: FnoAnalysisDataQuality;
  timestamp: string;
}

const instrumentNames = Object.keys(WORKSTATION_INSTRUMENTS);

const continuousInputSchema = z.object({
  instrument: z
    .string()
    .refine((v) => instrumentNames.includes(v), { message: "Unknown instrument" })
    .optional(),
  expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expiry must be YYYY-MM-DD")
    .optional(),
  accountCapital: z.number().finite().min(1000).max(1_000_000_000).optional(),
  maxRiskPerTradePct: z.number().finite().min(0.1).max(10).optional(),
});

/**
 * Get unified real-time continuous F&O + Options Greeks intelligence
 */
export const getContinuousFnoIntelligence = createServerFn({ method: "POST" })
  .validator((d: unknown) => continuousInputSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<ContinuousFnoData> => {
    const instrument = data.instrument || "NIFTY 50";
    const expiry = data.expiry;
    const capital = data.accountCapital ?? 30000;
    const riskPct = data.maxRiskPerTradePct ?? 2.0;

    const session = tradingSessionService.getSessionInfo(undefined, instrument);
    const [snapshot, greeks] = await Promise.all([
      fnoMarketDataService.getMarketSnapshot(instrument, expiry),
      optionsGreeksDataService.getGreeksSnapshot(instrument, expiry),
    ]);
    const greeksReport = greeksAnalysisService.analyzeGreeks(greeks);
    const analysis = fnoSignalAnalysisService.analyzeCombinedSignal(snapshot, greeksReport);

    const candidatesResult = tradeCandidateService.evaluateCandidates(
      snapshot,
      greeksReport,
      analysis,
      capital,
      riskPct,
    );

    return {
      session,
      snapshot,
      greeks,
      greeksReport,
      analysis,
      candidatesResult,
      dataQuality: analysis.dataQuality,
      timestamp: new Date().toISOString(),
    };
  });
