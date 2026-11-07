import { createFileRoute } from "@tanstack/react-router";

/**
 * Server feed endpoint for DhanHQ market data ticks (100% Dhan-backed).
 */
export const Route = createFileRoute("/api/market-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getLiveTick, isIndianMarketOpenNow } = await import("@/lib/live-feed.server");
        const url = new URL(request.url);
        const symbol = url.searchParams.get("symbol") || "NIFTY 50";
        try {
          const isOpen = isIndianMarketOpenNow();
          const tick = await getLiveTick(symbol);
          return Response.json(
            {
              ok: true,
              symbol,
              isMarketOpen: isOpen,
              tick,
              feedSource: "DhanHQ Live Direct Feed v2",
              timestamp: Date.now(),
            },
            {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        } catch (e) {
          return Response.json(
            {
              ok: false,
              symbol,
              error: (e as Error).message,
            },
            {
              status: 500,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
