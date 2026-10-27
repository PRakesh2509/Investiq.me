import { createFileRoute } from "@tanstack/react-router";
import { optionsGreeksDataService } from "@/lib/services/optionsGreeksDataService";
import {
  badRequest,
  okJson,
  parseExpiryParam,
  parseInstrumentParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/greeks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const inst = parseInstrumentParam(url.searchParams.get("instrument"));
          if (!inst.ok) return badRequest(inst.error);
          const exp = parseExpiryParam(url.searchParams.get("expiry"));
          if (!exp.ok) return badRequest(exp.error);

          const greeks = await optionsGreeksDataService.getGreeksSnapshot(inst.value, exp.value);

          return okJson({
            ok: true,
            data: greeks,
            dataQuality: {
              greeks: greeks.dataSource,
              isSimulated: greeks.isSimulated,
              provider: greeks.provider,
              velocityAvailable: greeks.velocityAvailable,
              timestamp: greeks.timestamp,
            },
          });
        } catch (e) {
          return serverError("api/fno/greeks", e);
        }
      },
    },
  },
});
