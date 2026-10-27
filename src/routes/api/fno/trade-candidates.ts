import { createFileRoute } from "@tanstack/react-router";
import { fnoMarketDataService } from "@/lib/services/fnoMarketDataService";
import { optionsGreeksDataService } from "@/lib/services/optionsGreeksDataService";
import { greeksAnalysisService } from "@/lib/services/greeksAnalysisService";
import { fnoSignalAnalysisService } from "@/lib/services/fnoSignalAnalysisService";
import { tradeCandidateService } from "@/lib/services/tradeCandidateService";
import {
  badRequest,
  okJson,
  parseExpiryParam,
  parseInstrumentParam,
  parseNumberParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/trade-candidates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const inst = parseInstrumentParam(url.searchParams.get("instrument"));
          if (!inst.ok) return badRequest(inst.error);
          const exp = parseExpiryParam(url.searchParams.get("expiry"));
          if (!exp.ok) return badRequest(exp.error);
          const capital = parseNumberParam(url.searchParams.get("capital"), "capital", {
            defaultValue: 30000,
            min: 1000,
            max: 1_000_000_000,
          });
          if (!capital.ok) return badRequest(capital.error);
          const riskPct = parseNumberParam(url.searchParams.get("riskPct"), "riskPct", {
            defaultValue: 2.0,
            min: 0.1,
            max: 10,
          });
          if (!riskPct.ok) return badRequest(riskPct.error);

          const [marketSnapshot, greeksSnapshot] = await Promise.all([
            fnoMarketDataService.getMarketSnapshot(inst.value, exp.value),
            optionsGreeksDataService.getGreeksSnapshot(inst.value, exp.value),
          ]);
          const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
          const combinedAnalysis = fnoSignalAnalysisService.analyzeCombinedSignal(
            marketSnapshot,
            greeksReport,
          );

          const result = tradeCandidateService.evaluateCandidates(
            marketSnapshot,
            greeksReport,
            combinedAnalysis,
            capital.value,
            riskPct.value,
          );

          return okJson({
            ok: true,
            data: result,
            dataQuality: combinedAnalysis.dataQuality,
          });
        } catch (e) {
          return serverError("api/fno/trade-candidates", e);
        }
      },
    },
  },
});
