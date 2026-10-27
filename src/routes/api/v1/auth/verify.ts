import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateAnyKey,
  jsonResponse,
  optionsResponse,
} from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/auth/verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              valid: false,
              error: "No API key provided. Use the x-api-key header or Authorization: Bearer.",
            },
            401,
            request,
          );
        }

        const { nse: isNse, global: isGlobal } = await validateAnyKey(key);

        if (!isNse && !isGlobal) {
          return jsonResponse({ ok: false, valid: false, error: "Invalid API key" }, 403, request);
        }

        const marketScope = [
          ...(isNse ? ["NIFTY 50", "BANK NIFTY", "FIN NIFTY", "SENSEX", "MIDCAP NIFTY"] : []),
          ...(isGlobal ? ["S&P 500", "NASDAQ 100", "DOW JONES"] : []),
        ];

        return jsonResponse(
          {
            ok: true,
            valid: true,
            keyType: isNse && isGlobal ? "ALL" : isNse ? "NSE_FNO" : "GLOBAL",
            marketScope,
            permissions: ["market_data", "trade_signals", "paper_execution"],
            status: "ACTIVE",
            verifiedAt: new Date().toISOString(),
          },
          200,
          request,
        );
      },
    },
  },
});
