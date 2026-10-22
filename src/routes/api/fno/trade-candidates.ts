import { createFileRoute } from "@tanstack/react-router";
import { fnoMarketDataService } from "@/lib/services/fnoMarketDataService";
import { optionsGreeksDataService } from "@/lib/services/optionsGreeksDataService";
import { greeksAnalysisService } from "@/lib/services/greeksAnalysisService";
import { fnoSignalAnalysisService } from "@/lib/services/fnoSignalAnalysisService";
import { tradeCandidateService } from "@/lib/services/tradeCandidateService";

export const Route = createFileRoute("/api/fno/trade-candidates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const instrument = url.searchParams.get("instrument") || "NIFTY 50";
          const expiry = url.searchParams.get("expiry") || undefined;
          const capital = parseFloat(url.searchParams.get("capital") || "30000");
          const riskPct = parseFloat(url.searchParams.get("riskPct") || "2.0");

          const marketSnapshot = await fnoMarketDataService.getMarketSnapshot(instrument, expiry);
          const greeksSnapshot = await optionsGreeksDataService.getGreeksSnapshot(instrument, expiry);
          const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
          const combinedAnalysis = fnoSignalAnalysisService.analyzeCombinedSignal(marketSnapshot, greeksReport);

          const result = tradeCandidateService.evaluateCandidates(
            marketSnapshot,
            greeksReport,
            combinedAnalysis,
            capital,
            riskPct
          );

          return Response.json(
            { ok: true, data: result },
            { headers: { "cache-control": "no-store, max-age=0" } }
          );
        } catch (e) {
          const err = e as Error;
          console.error("[api/fno/trade-candidates]", err.message);
          return Response.json(
            { ok: false, error: err.message },
            { status: 500, headers: { "cache-control": "no-store" } }
          );
        }
      },
    },
  },
});
