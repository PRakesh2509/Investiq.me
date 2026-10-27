import { createFileRoute } from "@tanstack/react-router";
import { fnoMarketDataService } from "@/lib/services/fnoMarketDataService";
import { optionsGreeksDataService } from "@/lib/services/optionsGreeksDataService";
import { greeksAnalysisService } from "@/lib/services/greeksAnalysisService";
import { fnoSignalAnalysisService } from "@/lib/services/fnoSignalAnalysisService";
import {
  badRequest,
  okJson,
  parseExpiryParam,
  parseInstrumentParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/analysis")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const inst = parseInstrumentParam(url.searchParams.get("instrument"));
          if (!inst.ok) return badRequest(inst.error);
          const exp = parseExpiryParam(url.searchParams.get("expiry"));
          if (!exp.ok) return badRequest(exp.error);

          const [marketSnapshot, greeksSnapshot] = await Promise.all([
            fnoMarketDataService.getMarketSnapshot(inst.value, exp.value),
            optionsGreeksDataService.getGreeksSnapshot(inst.value, exp.value),
          ]);
          const greeksReport = greeksAnalysisService.analyzeGreeks(greeksSnapshot);
          const combinedAnalysis = fnoSignalAnalysisService.analyzeCombinedSignal(
            marketSnapshot,
            greeksReport,
          );

          return okJson({
            ok: true,
            data: combinedAnalysis,
            dataQuality: combinedAnalysis.dataQuality,
          });
        } catch (e) {
          return serverError("api/fno/analysis", e);
        }
      },
    },
  },
});
