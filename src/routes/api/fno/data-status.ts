import { createFileRoute } from "@tanstack/react-router";
import { tradingSessionService } from "@/lib/services/tradingSessionService";
import { getSensibullAuthorizationStatus, getDhanProviderStatus } from "@/lib/options-data-provider.server";
import { marketDataValidationService } from "@/lib/services/marketDataValidationService";

export const Route = createFileRoute("/api/fno/data-status")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const session = tradingSessionService.getSessionInfo();
          const sensibull = getSensibullAuthorizationStatus();
          const dhan = getDhanProviderStatus();

          const sampleValidation = marketDataValidationService.validateQuote({
            instrument: "NIFTY 50",
            spotPrice: 22862.9,
            timestamp: Date.now(),
            bid: 120.0,
            ask: 120.5,
            volume: 10000,
            openInterest: 50000,
          });

          return Response.json(
            {
              ok: true,
              data: {
                session,
                providers: {
                  dhan,
                  sensibull,
                },
                validation: sampleValidation,
                timestamp: new Date().toISOString(),
              },
            },
            { headers: { "cache-control": "no-store, max-age=0" } }
          );
        } catch (e) {
          const err = e as Error;
          console.error("[api/fno/data-status]", err.message);
          return Response.json(
            { ok: false, error: err.message },
            { status: 500, headers: { "cache-control": "no-store" } }
          );
        }
      },
    },
  },
});
