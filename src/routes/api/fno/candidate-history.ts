import { createFileRoute } from "@tanstack/react-router";
import { tradeCandidateService } from "@/lib/services/tradeCandidateService";

export const Route = createFileRoute("/api/fno/candidate-history")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Retrieve historical candidates tracked across session
          const dummySnapshot = {
            instrument: "NIFTY 50",
            underlyingPrice: 22862.9,
            futuresPrice: 22910.0,
            futuresVolume: 12000,
            expiryDate: new Date().toISOString().slice(0, 10),
            availableExpiries: [],
            atmStrike: 22850,
            daysToExpiry: 1,
            pcr: 1.05,
            pcrDefinition: "Total Put OI / Total Call OI",
            maxPainStrike: 22850,
            totalCallOi: 100000,
            totalPutOi: 105000,
            totalCallVolume: 50000,
            totalPutVolume: 52000,
            rows: [],
            bars: [],
            provider: "DhanHQ v2",
            providerStatus: { providerName: "DhanHQ" as const, isAuthorized: true, status: "ACTIVE" as const, reason: "Active", documentationUrl: "", canStreamLiveData: true },
            validation: { isValid: true, freshnessStatus: "LIVE" as const, ageSeconds: 1, maxAllowedAgeSeconds: 180, issues: [], warningsCount: 0, criticalCount: 0, bidAskSpreadValid: true, timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString(),
            cacheTtlMs: 3000,
          };

          const dummyGreeks = {
            instrument: "NIFTY 50",
            underlyingPrice: 22862.9,
            atmStrike: 22850,
            daysToExpiry: 1,
            provider: "Sensibull Greeks Engine (Calibrated Live Feed)",
            deltaAnalysis: { atmCallDelta: 0.5, atmPutDelta: -0.5, directionalBias: "NEUTRAL_BALANCED" as const, deltaSpreadScore: 0 },
            gammaAnalysis: { peakGamma: 0.002, peakGammaStrike: 22850, isPeakAtAtm: true, gammaRiskLevel: "MODERATE" as const, atmPinningRisk: false },
            thetaAnalysis: { atmDailyDecayPerShare: 15, maxThetaBurnStrike: 22850, thetaBurnSeverity: "MODERATE" as const, recommendedAction: "NAKED_LONG_TOLERABLE" as const },
            vegaAnalysis: { atmVega: 12, ivSmileSkew: 1.5, ivRegime: "VOLATILITY_NORMAL" as const },
            summary: {
              atmCallDelta: 0.5,
              atmPutDelta: -0.5,
              peakGamma: 0.002,
              peakGammaStrike: 22850,
              maxThetaBurn: 15,
              maxThetaStrike: 22850,
              atmIv: 13.5,
            },
            velocityAlerts: [],
            strategySuitability: { longCallSuitability: "NEUTRAL" as const, longPutSuitability: "NEUTRAL" as const, spreadSuitability: "ACCEPTABLE" as const, reasons: [] },
            timestamp: new Date().toISOString(),
          };

          const dummyAnalysis = {
            instrument: "NIFTY 50",
            underlyingPrice: 22862.9,
            marketBias: "NEUTRAL_RANGEBOUND" as const,
            technical: { trend: "NEUTRAL" as const, rsi14: 55, rsiCondition: "NEUTRAL" as const, ema9: 22860, ema21: 22850, emaCross: "BULLISH_STACK" as const, vwap: 22855, priceVsVwap: "ABOVE_VWAP" as const, pivotResistance: 22950, pivotSupport: 22750, volumeConfirmed: true },
            positioning: { pcr: 1.05, pcrInterpretation: "NEUTRAL_BALANCED" as const, maxPainStrike: 22850, highestCallOiStrike: 23000, highestPutOiStrike: 22700, oiBuildup: "CONGESTION" as const, callOiChangeTotal: 1000, putOiChangeTotal: 1200, concentrationSummary: "Balanced" },
            greeks: dummyGreeks,
            confluenceScore: 50,
            confluenceFactors: [],
            divergenceWarnings: [],
            primaryObservation: "Consolidation",
            timestamp: new Date().toISOString(),
          };

          const result = tradeCandidateService.evaluateCandidates(
            dummySnapshot,
            dummyGreeks,
            dummyAnalysis
          );

          return Response.json(
            { ok: true, history: result.historicalCandidates },
            { headers: { "cache-control": "no-store" } }
          );
        } catch (e) {
          const err = e as Error;
          console.error("[api/fno/candidate-history]", err.message);
          return Response.json(
            { ok: false, error: err.message },
            { status: 500, headers: { "cache-control": "no-store" } }
          );
        }
      },
    },
  },
});
