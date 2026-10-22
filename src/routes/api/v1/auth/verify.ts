import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateNseFnoKey,
  validateGlobalKey,
  jsonResponse,
  CORS_HEADERS,
} from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/auth/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse({ ok: false, valid: false, error: "No API key provided" }, 401);
        }

        const isNse = validateNseFnoKey(key);
        const isGlobal = validateGlobalKey(key);

        if (!isNse && !isGlobal) {
          return jsonResponse(
            { ok: false, valid: false, error: "Invalid API key" },
            403
          );
        }

        return jsonResponse({
          ok: true,
          valid: true,
          keyType: isNse ? "NSE_FNO" : "GLOBAL",
          marketScope: isNse
            ? ["NIFTY 50", "BANK NIFTY", "FIN NIFTY", "SENSEX", "MIDCAP NIFTY"]
            : ["S&P 500", "NASDAQ 100", "DOW JONES"],
          permissions: ["market_data", "trade_signals", "paper_execution"],
          status: "ACTIVE",
          verifiedAt: new Date().toISOString(),
        });
      },
    },
  },
});
