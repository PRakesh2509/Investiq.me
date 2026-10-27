import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateGlobalKey,
  jsonResponse,
  optionsResponse,
} from "@/lib/api-auth.server";
import { getTerminalSnapshot, WORKSTATION_INSTRUMENTS } from "@/lib/terminal-workstation.functions";
import { analyzeInstrument, buildSignalsPayload } from "@/lib/trade-analysis.server";

const GLOBAL_INSTRUMENTS = ["S&P 500", "NASDAQ 100", "DOW JONES"];

export const Route = createFileRoute("/api/v1/global/signals")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Missing API Key. Provide your GLOBAL API key in the 'x-api-key' header or as 'Authorization: Bearer'.",
              authFormat: "x-api-key: iq_global_...",
            },
            401,
            request,
          );
        }

        if (!(await validateGlobalKey(key))) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid GLOBAL API key or unauthorized for Global Index markets.",
              hint: "Use your dedicated GLOBAL API key from the Admin Panel.",
            },
            403,
            request,
          );
        }

        const url = new URL(request.url);
        const rawInst = url.searchParams.get("instrument") || "S&P 500";
        const normalized = rawInst.trim().toUpperCase().replace(/[-_]/g, " ");

        const instrument =
          GLOBAL_INSTRUMENTS.find(
            (i) =>
              i.toUpperCase() === normalized ||
              i.replace(/\s+/g, "") === normalized.replace(/\s+/g, ""),
          ) || "S&P 500";

        const cfg = WORKSTATION_INSTRUMENTS[instrument] ?? WORKSTATION_INSTRUMENTS["S&P 500"];
        const [quote, analysis] = await Promise.all([
          getTerminalSnapshot(instrument),
          analyzeInstrument(instrument, "GLOBAL_US"),
        ]);

        // Whole data layer down (no real quote and no engine data): 503. Everything else,
        // including "no trade right now", is a valid 200 response with an empty setups list.
        if (
          !quote.ok &&
          analysis.result.status === "DATA_UNAVAILABLE" &&
          !analysis.state?.fnoSnapshot
        ) {
          return jsonResponse(
            {
              ok: false,
              error: "Market data is currently unavailable.",
              instrument,
              status: analysis.result.status,
              reason: analysis.result.reason,
              setups: [],
              dataQuality: analysis.result.dataQuality,
              timestamp: new Date().toISOString(),
            },
            503,
            request,
          );
        }

        return jsonResponse(
          buildSignalsPayload({
            market: "GLOBAL_US",
            instrument,
            quote,
            config: cfg,
            result: analysis.result,
            state: analysis.state,
            macro: analysis.macro,
          }),
          200,
          request,
        );
      },
    },
  },
});
