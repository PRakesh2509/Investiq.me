import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateNseFnoKey,
  validateGlobalKey,
  jsonResponse,
  CORS_HEADERS,
} from "@/lib/api-auth.server";
import { WORKSTATION_INSTRUMENTS } from "@/lib/terminal-workstation.functions";

export const Route = createFileRoute("/api/v1/trades/order")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error: "Missing API Key. Include 'x-api-key' header with your NSE F&O or GLOBAL API key.",
            },
            401
          );
        }

        const isNseKey = validateNseFnoKey(key);
        const isGlobalKey = validateGlobalKey(key);

        if (!isNseKey && !isGlobalKey) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid API key. Please check your API key from the InvestIQ Admin Panel.",
            },
            403
          );
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid JSON request body. Required fields: { symbol, contract, action, lots, price }",
            },
            400
          );
        }

        const {
          symbol = "NIFTY 50",
          contract,
          action = "BUY",
          lots = 1,
          price,
          orderType = "MARKET",
        } = body;

        const isGlobalSymbol = ["S&P 500", "NASDAQ 100", "DOW JONES"].includes(symbol);

        // Scope check
        if (isGlobalSymbol && !isGlobalKey) {
          return jsonResponse(
            {
              ok: false,
              error: `Unauthorized: Symbol '${symbol}' requires a GLOBAL API key. Current key is an NSE F&O key.`,
            },
            403
          );
        }

        if (!isGlobalSymbol && !isNseKey) {
          return jsonResponse(
            {
              ok: false,
              error: `Unauthorized: Symbol '${symbol}' requires an NSE F&O API key. Current key is a GLOBAL key.`,
            },
            403
          );
        }

        const cfg = WORKSTATION_INSTRUMENTS[symbol] ?? WORKSTATION_INSTRUMENTS["NIFTY 50"];
        const lotSize = cfg.lotSize;
        const totalQuantity = (Number(lots) || 1) * lotSize;
        const executionPrice = Number(price) > 0 ? Number(price) : 137.5;
        const totalValue = +(totalQuantity * executionPrice).toFixed(2);
        const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        return jsonResponse({
          ok: true,
          message: "Paper trade order simulated and filled successfully.",
          order: {
            orderId,
            status: "FILLED",
            market: isGlobalSymbol ? "GLOBAL_INDICES" : "NSE_FNO",
            symbol,
            contract: contract || `${symbol} ATM Option`,
            action: String(action).toUpperCase(),
            orderType: String(orderType).toUpperCase(),
            lots: Number(lots) || 1,
            lotSize,
            totalQuantity,
            fillPrice: executionPrice,
            currency: cfg.currency,
            totalOutlay: totalValue,
            timestamp: new Date().toISOString(),
          },
          broker: "InvestIQ Paper Trading Execution Router",
        });
      },
    },
  },
});
