import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateNseFnoKey,
  jsonResponse,
  CORS_HEADERS,
} from "@/lib/api-auth.server";
import {
  computeTerminalData,
  WORKSTATION_INSTRUMENTS,
} from "@/lib/terminal-workstation.functions";

const NSE_INSTRUMENTS = [
  "NIFTY 50",
  "BANK NIFTY",
  "FIN NIFTY",
  "SENSEX",
  "MIDCAP NIFTY",
];

export const Route = createFileRoute("/api/v1/fno/signals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error: "Missing API Key. Please provide your NSE F&O API key in the 'x-api-key' header or '?apiKey=' query param.",
              authFormat: "x-api-key: iq_nse_fno_...",
            },
            401
          );
        }

        if (!validateNseFnoKey(key)) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid NSE F&O API key or unauthorized for Indian F&O markets.",
              hint: "Use your dedicated NSE F&O API key from the Admin Panel.",
            },
            403
          );
        }

        const url = new URL(request.url);
        const rawInst = url.searchParams.get("instrument") || "NIFTY 50";
        const normalized = rawInst.trim().toUpperCase().replace(/[-_]/g, " ");

        // Match supported instrument
        const instrument =
          NSE_INSTRUMENTS.find(
            (i) => i.toUpperCase() === normalized || i.replace(/\s+/g, "") === normalized.replace(/\s+/g, "")
          ) || "NIFTY 50";

        const data = computeTerminalData(instrument);
        const cfg = WORKSTATION_INSTRUMENTS[instrument] ?? WORKSTATION_INSTRUMENTS["NIFTY 50"];

        return jsonResponse({
          ok: true,
          market: "NSE_FNO",
          instrument,
          currency: cfg.currency,
          lotSize: cfg.lotSize,
          spotPrice: data.spotPrice,
          change: data.change,
          changePct: data.changePct,
          marketSession: {
            isOpen: data.isMarketOpen,
            statusText: data.marketSessionText,
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
          optionStrikes: data.strikes.map((s) => ({
            strike: s.strike,
            isAtm: s.isAtm,
            call: {
              contract: `${instrument.replace(/[^A-Z0-9]/g, "")} ${s.strike} CE`,
              ltp: s.callLtp,
              type: s.callType,
            },
            put: {
              contract: `${instrument.replace(/[^A-Z0-9]/g, "")} ${s.strike} PE`,
              ltp: s.putLtp,
              type: s.putType,
            },
          })),
          timestamp: new Date().toISOString(),
          paperTradingNote: "Use recommendedContract, action, and recommendedPremium to execute paper orders on your trading webpage.",
        });
      },
    },
  },
});
