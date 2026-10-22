import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateGlobalKey,
  jsonResponse,
  CORS_HEADERS,
} from "@/lib/api-auth.server";
import {
  computeTerminalData,
  WORKSTATION_INSTRUMENTS,
} from "@/lib/terminal-workstation.functions";

const GLOBAL_INSTRUMENTS = ["S&P 500", "NASDAQ 100", "DOW JONES"];

export const Route = createFileRoute("/api/v1/global/signals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error: "Missing API Key. Please provide your GLOBAL API key in the 'x-api-key' header or '?apiKey=' query param.",
              authFormat: "x-api-key: iq_global_...",
            },
            401
          );
        }

        if (!validateGlobalKey(key)) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid GLOBAL API key or unauthorized for Global Index markets.",
              hint: "Use your dedicated GLOBAL API key from the Admin Panel.",
            },
            403
          );
        }

        const url = new URL(request.url);
        const rawInst = url.searchParams.get("instrument") || "S&P 500";
        const normalized = rawInst.trim().toUpperCase().replace(/[-_]/g, " ");

        const instrument =
          GLOBAL_INSTRUMENTS.find(
            (i) => i.toUpperCase() === normalized || i.replace(/\s+/g, "") === normalized.replace(/\s+/g, "")
          ) || "S&P 500";

        const data = computeTerminalData(instrument);
        const cfg = WORKSTATION_INSTRUMENTS[instrument] ?? WORKSTATION_INSTRUMENTS["S&P 500"];

        return jsonResponse({
          ok: true,
          market: "GLOBAL_INDICES",
          instrument,
          currency: cfg.currency,
          lotSize: cfg.lotSize,
          spotPrice: data.spotPrice,
          change: data.change,
          changePct: data.changePct,
          marketSession: {
            isOpen: true,
            statusText: "GLOBAL SESSION LIVE",
          },
          signal: {
            action: data.actionText,
            direction: data.direction,
            grade: data.grade,
            confidenceScore: data.confidenceScore,
            rationale: data.rationale,
            recommendedContract: data.contractName,
            recommendedPremium: data.recommendedPremium,
            entrySpot: data.spotEntry,
            target1: data.tp1,
            target2: data.tp2,
            stopLoss: data.stopLoss,
            riskRewardRatio: "1 : 2.5",
          },
          timestamp: new Date().toISOString(),
          paperTradingNote: "Use recommendedContract, action, and recommendedPremium to execute global paper orders on your trading webpage.",
        });
      },
    },
  },
});
