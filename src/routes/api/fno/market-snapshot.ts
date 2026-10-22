import { createFileRoute } from "@tanstack/react-router";
import { fnoMarketDataService } from "@/lib/services/fnoMarketDataService";

export const Route = createFileRoute("/api/fno/market-snapshot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const instrument = url.searchParams.get("instrument") || "NIFTY 50";
          const expiry = url.searchParams.get("expiry") || undefined;

          const snapshot = await fnoMarketDataService.getMarketSnapshot(instrument, expiry);

          return Response.json(
            { ok: true, data: snapshot },
            { headers: { "cache-control": "no-store, max-age=0" } }
          );
        } catch (e) {
          const err = e as Error;
          console.error("[api/fno/market-snapshot]", err.message);
          return Response.json(
            { ok: false, error: err.message },
            { status: 500, headers: { "cache-control": "no-store" } }
          );
        }
      },
    },
  },
});
