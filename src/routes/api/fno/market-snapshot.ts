import { createFileRoute } from "@tanstack/react-router";
import { fnoMarketDataService } from "@/lib/services/fnoMarketDataService";
import {
  badRequest,
  okJson,
  parseExpiryParam,
  parseInstrumentParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/market-snapshot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const inst = parseInstrumentParam(url.searchParams.get("instrument"));
          if (!inst.ok) return badRequest(inst.error);
          const exp = parseExpiryParam(url.searchParams.get("expiry"));
          if (!exp.ok) return badRequest(exp.error);

          const snapshot = await fnoMarketDataService.getMarketSnapshot(inst.value, exp.value);

          return okJson({
            ok: true,
            data: snapshot,
            dataQuality: {
              chain: snapshot.dataSource,
              isSimulated: snapshot.isSimulated,
              provider: snapshot.provider,
              candles: {
                source: snapshot.barsSource,
                lastBarAt: snapshot.barsLastAt,
                error: snapshot.barsError,
              },
              freshness: snapshot.validation.freshnessStatus,
              ageSeconds: snapshot.validation.ageSeconds,
            },
          });
        } catch (e) {
          return serverError("api/fno/market-snapshot", e);
        }
      },
    },
  },
});
