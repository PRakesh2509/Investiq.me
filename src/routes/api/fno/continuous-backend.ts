import { createFileRoute } from "@tanstack/react-router";
import { sensibullContinuousEngine } from "@/lib/sensibull-continuous-engine.server";
import {
  badRequest,
  okJson,
  parseInstrumentParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/continuous-backend")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const inst = parseInstrumentParam(url.searchParams.get("instrument"));
          if (!inst.ok) return badRequest(inst.error);

          // On-demand evaluation: served from a short TTL cache and shared across concurrent
          // callers (single-flight). No background daemon runs on Workers.
          const state = await sensibullContinuousEngine.getState(inst.value);

          if (state.status === "ERROR") {
            return okJson(
              {
                ok: false,
                error: "Market data computation failed",
                instrument: state.instrument,
                status: state.status,
                dataQuality: state.dataQuality,
                metrics: {
                  ...state.metrics,
                  lastError: state.metrics.lastError?.slice(0, 200),
                },
              },
              503,
            );
          }

          const candidates = state.candidates;
          const noTrade = candidates?.noTradeDecision;
          const score = state.tradeScore;
          const velocityAvailable = state.greeksSnapshot?.velocityAvailable ?? false;

          return okJson({
            ok: true,
            engine: "SensibullContinuousEngine (on-demand, TTL-cached)",
            cadence: `computed on demand; cached for ${state.ttlMs}ms with single-flight de-duplication`,
            instrument: state.instrument,
            status: state.status,
            loopCount: state.loopCount,
            latencyMs: state.latencyMs,
            underlyingPrice: state.underlyingPrice,
            timestamp: state.timestamp,
            ageMs: Math.max(0, Date.now() - state.computedAtMs),
            session: state.session,
            dataQuality: state.dataQuality,
            metrics: state.metrics,
            analyzedData: {
              greeksSummary: state.greeksSnapshot?.summary,
              greeksVelocityAvailable: velocityAvailable,
              greeksVelocityCount: velocityAvailable
                ? (state.greeksSnapshot?.velocity.length ?? 0)
                : 0,
              greeksAnalysisDirection: state.greeksAnalysis?.deltaAnalysis.directionalBias,
              gammaConvexityPeak: state.greeksAnalysis?.gammaAnalysis.peakGamma,
              thetaBurnSeverity: state.greeksAnalysis?.thetaAnalysis.thetaBurnSeverity,
              fnoSignalDirection: state.fnoSignalAnalysis?.marketBias ?? null,
              fnoConfluenceScore: state.fnoSignalAnalysis?.confluenceScore ?? null,
              tradeScore: score
                ? {
                    score: score.overallScore,
                    bias: score.marketBias,
                    confidence: score.confidenceLevel,
                    dataQuality: score.dataQuality,
                    dataCoverage: score.dataCoverage,
                    scoreCap: score.scoreCap,
                    hardRiskGatePassed: score.allHardRiskPassed,
                    failedRiskChecks: score.riskChecks
                      .filter((c) => !c.passed)
                      .map((c) => ({ id: c.id, observedValue: c.observedValue })),
                    factorsEvaluated: score.factorBreakdown.filter((f) => f.available).length,
                    factorsUnavailable: score.factorBreakdown
                      .filter((f) => !f.available)
                      .map((f) => f.id),
                  }
                : null,
              candidatesGenerated: candidates?.activeCandidates.length ?? 0,
              noTradeReasonCode: noTrade?.reasonCode ?? null,
              noTradeViolation: noTrade?.headline ?? null,
              stressScenariosEvaluated: state.scenarioAudit?.scenarios?.length ?? 0,
            },
          });
        } catch (e) {
          return serverError("api/fno/continuous-backend", e);
        }
      },
    },
  },
});
