import { createFileRoute } from "@tanstack/react-router";
import { optionsGreeksDataService } from "@/lib/services/optionsGreeksDataService";

export const Route = createFileRoute("/api/fno/greeks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const instrument = url.searchParams.get("instrument") || "NIFTY 50";
          const expiry = url.searchParams.get("expiry") || undefined;

          const greeks = await optionsGreeksDataService.getGreeksSnapshot(instrument, expiry);

          return Response.json(
            { ok: true, data: greeks },
            { headers: { "cache-control": "no-store, max-age=0" } }
          );
        } catch (e) {
          const err = e as Error;
          console.error("[api/fno/greeks]", err.message);
          return Response.json(
            { ok: false, error: err.message },
            { status: 500, headers: { "cache-control": "no-store" } }
          );
        }
      },
    },
  },
});
