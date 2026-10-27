import { createFileRoute } from "@tanstack/react-router";
import { sensibullContinuousEngine } from "@/lib/sensibull-continuous-engine.server";

export const Route = createFileRoute("/api/fno/continuous-backend")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const state = sensibullContinuousEngine.getLatestState();
          return Response.json(
            {
              ok: true,
              engine: "SensibullContinuousEngine (1-Second Backend Daemon)",
              cadence: "1000ms continuous streaming",
              status: state.status,
              loopCount: state.loopCount,
              latencyMs: state.latencyMs,
              underlyingPrice: state.underlyingPrice,
              timestamp: state.timestamp,
              metrics: state.metrics,
              analyzedData: {
                greeksSummary: state.greeksSnapshot?.summary,
                greeksVelocityCount: state.greeksSnapshot?.velocity?.length ?? 0,
                greeksAnalysisDirection: state.greeksAnalysis?.deltaAnalysis?.directionalBias,
                gammaConvexityPeak: state.greeksAnalysis?.gammaAnalysis?.peakGamma,
                thetaBurnSeverity: state.greeksAnalysis?.thetaAnalysis?.thetaBurnSeverity,
                fnoSignalDirection: state.fnoSignalAnalysis?.signalDirection,
                fnoConfluenceScore: state.fnoSignalAnalysis?.overallConfluenceScore,
                tradeScore: state.tradeScore ? {
                  score: state.tradeScore.overallScore,
                  confidence: state.tradeScore.confidenceLevel,
                  hardRiskGatePassed: state.tradeScore.allHardRiskPassed,
                  factorsEvaluated: state.tradeScore.factorBreakdown?.length ?? 0,
                } : null,
                candidatesGenerated: state.candidates?.candidates?.length ?? 0,
                noTradeViolation: state.candidates?.noTradeDecision?.reason ?? null,
                stressScenariosEvaluated: state.scenarioAudit?.scenarios?.length ?? 0,
              },
            },
            {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
            }
          );
        } catch (e) {
          const err = e as Error;
          return Response.json(
            { ok: false, error: err.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
      },
    },
  },
});
