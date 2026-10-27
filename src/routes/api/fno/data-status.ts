import { createFileRoute } from "@tanstack/react-router";
import { tradingSessionService } from "@/lib/services/tradingSessionService";
import { fnoMarketDataService } from "@/lib/services/fnoMarketDataService";
import {
  getSensibullAuthorizationStatus,
  getDhanProviderStatus,
} from "@/lib/options-data-provider.server";
import {
  badRequest,
  okJson,
  parseInstrumentParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/data-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const inst = parseInstrumentParam(url.searchParams.get("instrument"));
          if (!inst.ok) return badRequest(inst.error);

          const session = tradingSessionService.getSessionInfo(undefined, inst.value);
          const sensibull = getSensibullAuthorizationStatus();
          const dhan = getDhanProviderStatus();

          // Real validation of the live snapshot (never a hand-built sample quote).
          let validation = null;
          let dataQuality = null;
          let snapshotError: string | null = null;
          try {
            const snapshot = await fnoMarketDataService.getMarketSnapshot(inst.value);
            validation = snapshot.validation;
            dataQuality = {
              chain: snapshot.dataSource,
              isSimulated: snapshot.isSimulated,
              provider: snapshot.provider,
              candles: { source: snapshot.barsSource, lastBarAt: snapshot.barsLastAt },
            };
          } catch (err) {
            snapshotError = err instanceof Error ? err.message.slice(0, 200) : "snapshot failed";
          }

          return okJson({
            ok: true,
            data: {
              instrument: inst.value,
              session,
              providers: {
                dhan,
                sensibull,
              },
              validation,
              dataQuality,
              snapshotError,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (e) {
          return serverError("api/fno/data-status", e);
        }
      },
    },
  },
});
