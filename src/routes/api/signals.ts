import { createFileRoute } from "@tanstack/react-router";
import { corsHeaders, optionsResponse } from "../../lib/api-auth.server.ts";
import {
  checkSignalsRateLimit,
  fetchAllSignals,
  verifyInvestIQApiKey,
  type SupportedMarket,
} from "../../lib/signals-api.server.ts";

/**
 * GET /api/signals
 *
 * Secured endpoint for external paper trading applications to read trade signals,
 * automatically separated and routed by market.
 *
 * Requirements:
 * 1. Auth: require header "x-api-key". Compare with env var INVESTIQ_API_KEY. Return 401 if missing or wrong.
 * 2. Rate limiting: 60 requests/minute per client. Return 429 if exceeded with Retry-After.
 * 3. Supported instruments:
 *    - INDIA_FNO: NIFTY, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY
 *    - US_FNO: SPX, NDX, DJI
 * 4. Query filters:
 *    - ?market=INDIA_FNO or ?market=US_FNO
 *    - ?since=<ISO timestamp>
 * 5. Returns:
 *    {
 *      "signals": [ ... ]
 *    }
 */
export const Route = createFileRoute("/api/signals")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),

      GET: async ({ request }) => {
        // 1. Rate Limiting Check
        const rate = checkSignalsRateLimit(request);
        if (!rate.allowed) {
          return Response.json(
            {
              ok: false,
              error: "Too Many Requests. Rate limit is 60 requests per minute.",
              retry_after_seconds: rate.retryAfterSeconds,
            },
            {
              status: 429,
              headers: {
                "Retry-After": String(rate.retryAfterSeconds),
                "Content-Type": "application/json",
                ...corsHeaders(request),
              },
            },
          );
        }

        // 2. Authentication Check (x-api-key vs INVESTIQ_API_KEY)
        const auth = await verifyInvestIQApiKey(request);
        if (!auth.authorized) {
          return Response.json(
            {
              ok: false,
              error: auth.error ?? "Unauthorized: Missing or invalid API key.",
            },
            {
              status: 401,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders(request),
              },
            },
          );
        }

        // 3. Query Parameter Validation & Extraction
        const url = new URL(request.url);
        const rawMarket = url.searchParams.get("market")?.trim().toUpperCase();
        let market: SupportedMarket | undefined;

        if (rawMarket) {
          if (rawMarket === "INDIA_FNO" || rawMarket === "US_FNO") {
            market = rawMarket;
          } else {
            return Response.json(
              {
                ok: false,
                error: `Invalid market '${rawMarket}'. Supported markets are 'INDIA_FNO' and 'US_FNO'.`,
              },
              {
                status: 400,
                headers: {
                  "Content-Type": "application/json",
                  ...corsHeaders(request),
                },
              },
            );
          }
        }

        const rawSince = url.searchParams.get("since")?.trim();
        let since: string | undefined;

        if (rawSince) {
          const parsed = Date.parse(rawSince);
          if (Number.isNaN(parsed)) {
            return Response.json(
              {
                ok: false,
                error:
                  "Invalid 'since' parameter. Must be a valid ISO-8601 timestamp (e.g. 2026-10-31T09:15:00Z).",
              },
              {
                status: 400,
                headers: {
                  "Content-Type": "application/json",
                  ...corsHeaders(request),
                },
              },
            );
          }
          since = new Date(parsed).toISOString();
        }

        // 4. Fetch and Filter Signals
        try {
          const signals = await fetchAllSignals({ market, since });

          return Response.json(
            { signals },
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                ...corsHeaders(request),
              },
            },
          );
        } catch (err) {
          console.error("[signals-api] Internal error fetching signals:", (err as Error)?.message);
          return Response.json(
            {
              ok: false,
              error: "An internal server error occurred while retrieving trade signals.",
            },
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders(request),
              },
            },
          );
        }
      },
    },
  },
});
