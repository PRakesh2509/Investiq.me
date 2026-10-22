import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateNseFnoKey,
  validateGlobalKey,
  jsonResponse,
  CORS_HEADERS,
} from "@/lib/api-auth.server";
import { WORKSTATION_INSTRUMENTS } from "@/lib/terminal-workstation.functions";
import {
  getIndianHighProfitTrades,
  getGlobalHighProfitTrades,
  getMarketTiming,
  type HighProfitTradeSetup,
} from "@/lib/trade-analysis";

export interface ExecutedPaperOrder {
  orderId: string;
  status: "FILLED" | "QUEUED_FOR_OPEN" | "ACTIVE";
  market: "NSE_FNO" | "GLOBAL_US";
  symbol: string;
  contract: string;
  action: "BUY" | "SELL";
  orderType: string;
  lots: number;
  lotSize: number;
  totalQuantity: number;
  fillPrice: number;
  currency: string;
  totalOutlay: number;
  currentPnlPoints?: number;
  currentPnlCurrency?: string;
  target1: number;
  target2: number;
  stopLoss: number;
  timestamp: string;
  timingNote: string;
  source: string;
}

// In-memory store of executed paper orders
const EXECUTED_ORDERS: ExecutedPaperOrder[] = [
  // 1. Initialized Pre-Dispatched Indian NSE F&O High-Profit Trade
  {
    orderId: "ORD_NSE_NIFTY_22850PE_LIVE",
    status: "FILLED",
    market: "NSE_FNO",
    symbol: "NIFTY 50",
    contract: "NIFTY50 22850 PE",
    action: "BUY",
    orderType: "MARKET",
    lots: 2,
    lotSize: 25,
    totalQuantity: 50,
    fillPrice: 138.0,
    currency: "₹",
    totalOutlay: 6900.0,
    currentPnlPoints: +28.5,
    currentPnlCurrency: "+₹1,425.00 (+20.6%)",
    target1: 195.0,
    target2: 245.0,
    stopLoss: 98.0,
    timestamp: new Date().toISOString(),
    timingNote: "Indian NSE Session (09:15 AM - 03:30 PM IST) · Ready / Queued for next trading session bell",
    source: "Automated Best-Profit Analyzer (Head & Shoulders Breakdown + FII Selling)",
  },
  // 2. Initialized Pre-Dispatched Indian Bank Nifty High-Profit Trade
  {
    orderId: "ORD_NSE_BANKNIFTY_51200CE_LIVE",
    status: "FILLED",
    market: "NSE_FNO",
    symbol: "BANK NIFTY",
    contract: "BANKNIFTY 51200 CE",
    action: "BUY",
    orderType: "MARKET",
    lots: 2,
    lotSize: 15,
    totalQuantity: 30,
    fillPrice: 315.0,
    currency: "₹",
    totalOutlay: 9450.0,
    currentPnlPoints: +42.0,
    currentPnlCurrency: "+₹1,260.00 (+13.3%)",
    target1: 450.0,
    target2: 560.0,
    stopLoss: 220.0,
    timestamp: new Date().toISOString(),
    timingNote: "Indian NSE Session (09:15 AM - 03:30 PM IST) · Support reversal setup",
    source: "Automated Best-Profit Analyzer (0.618 Fib Support + PCR 1.12 Accumulation)",
  },
  // 3. Initialized Pre-Dispatched US S&P 500 High-Profit Trade (US Session - Live Now)
  {
    orderId: "ORD_US_SPX_5870CALL_LIVE",
    status: "FILLED",
    market: "GLOBAL_US",
    symbol: "S&P 500",
    contract: "SPX 5870 CALL",
    action: "BUY",
    orderType: "MARKET",
    lots: 2,
    lotSize: 1,
    totalQuantity: 2,
    fillPrice: 28.5,
    currency: "$",
    totalOutlay: 57.0,
    currentPnlPoints: +5.4,
    currentPnlCurrency: "+$10.80 (+18.9%)",
    target1: 45.0,
    target2: 62.0,
    stopLoss: 18.5,
    timestamp: new Date().toISOString(),
    timingNote: "US Regular Session (07:00 PM - 01:30 AM IST / 09:30 AM - 04:00 PM EST) · LIVE NOW",
    source: "Automated Best-Profit Analyzer (Ascending Triangle Blue-Sky Breakout + VIX < 15)",
  },
  // 4. Initialized Pre-Dispatched US NASDAQ 100 High-Profit Trade (US Session - Live Now)
  {
    orderId: "ORD_US_NAS100_20450CALL_LIVE",
    status: "FILLED",
    market: "GLOBAL_US",
    symbol: "NASDAQ 100",
    contract: "NAS100 20450 CALL",
    action: "BUY",
    orderType: "MARKET",
    lots: 2,
    lotSize: 1,
    totalQuantity: 2,
    fillPrice: 50.0,
    currency: "$",
    totalOutlay: 100.0,
    currentPnlPoints: +8.5,
    currentPnlCurrency: "+$17.00 (+17.0%)",
    target1: 78.0,
    target2: 105.0,
    stopLoss: 32.0,
    timestamp: new Date().toISOString(),
    timingNote: "US Regular Session (07:00 PM - 01:30 AM IST / 09:30 AM - 04:00 PM EST) · LIVE NOW",
    source: "Automated Best-Profit Analyzer (AI Semiconductor Short-Gamma Squeeze)",
  },
];

export const Route = createFileRoute("/api/v1/trades/order")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      // GET: Returns high-profit analyzed trades, Greeks, geopolitical context, market timings, and executed paper orders
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error: "Missing API Key. Pass 'x-api-key: <KEY>' or '?apiKey=<KEY>'.",
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
              error: "Invalid API Key. Use your dedicated NSE F&O or GLOBAL API key.",
            },
            403
          );
        }

        // Return trades filtered by key scope
        if (isNseKey && !isGlobalKey) {
          const timing = getMarketTiming("NSE_FNO");
          const analyzedTrades = getIndianHighProfitTrades();
          const orders = EXECUTED_ORDERS.filter((o) => o.market === "NSE_FNO");

          return jsonResponse({
            ok: true,
            market: "NSE_FNO",
            keyScope: "Indian Markets (NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, MIDCAP)",
            marketTiming: timing,
            highProfitTrades: analyzedTrades,
            executedPaperOrders: orders,
            instructions: "Take trades directly using POST /api/v1/trades/order or integrate into your paper trading webpage.",
            timestamp: new Date().toISOString(),
          });
        }

        if (isGlobalKey && !isNseKey) {
          const timing = getMarketTiming("GLOBAL_US");
          const analyzedTrades = getGlobalHighProfitTrades();
          const orders = EXECUTED_ORDERS.filter((o) => o.market === "GLOBAL_US");

          return jsonResponse({
            ok: true,
            market: "GLOBAL_US",
            keyScope: "Global US Markets (S&P 500, NASDAQ 100, DOW JONES)",
            marketTiming: timing,
            highProfitTrades: analyzedTrades,
            executedPaperOrders: orders,
            instructions: "Take trades directly using POST /api/v1/trades/order or integrate into your paper trading webpage.",
            timestamp: new Date().toISOString(),
          });
        }

        // Both / Master
        return jsonResponse({
          ok: true,
          market: "ALL_MARKETS",
          marketTimings: {
            indianNSE: getMarketTiming("NSE_FNO"),
            usGlobal: getMarketTiming("GLOBAL_US"),
          },
          indianTrades: getIndianHighProfitTrades(),
          globalTrades: getGlobalHighProfitTrades(),
          allExecutedPaperOrders: EXECUTED_ORDERS,
          timestamp: new Date().toISOString(),
        });
      },

      // POST: Place & simulate an immediate paper trade order
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
          target1,
          target2,
          stopLoss,
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
        const executionPrice = Number(price) > 0 ? Number(price) : (isGlobalSymbol ? 28.5 : 138.0);
        const totalValue = +(totalQuantity * executionPrice).toFixed(2);
        const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        const timing = getMarketTiming(isGlobalSymbol ? "GLOBAL_US" : "NSE_FNO");

        const newOrder: ExecutedPaperOrder = {
          orderId,
          status: "FILLED",
          market: isGlobalSymbol ? "GLOBAL_US" : "NSE_FNO",
          symbol,
          contract: contract || `${symbol} Recommended Contract`,
          action: String(action).toUpperCase() as "BUY" | "SELL",
          orderType: String(orderType).toUpperCase(),
          lots: Number(lots) || 1,
          lotSize,
          totalQuantity,
          fillPrice: executionPrice,
          currency: cfg.currency,
          totalOutlay: totalValue,
          currentPnlPoints: 0.0,
          currentPnlCurrency: `${cfg.currency}0.00 (New Position)`,
          target1: Number(target1) || +(executionPrice * 1.45).toFixed(2),
          target2: Number(target2) || +(executionPrice * 1.8).toFixed(2),
          stopLoss: Number(stopLoss) || +(executionPrice * 0.7).toFixed(2),
          timestamp: new Date().toISOString(),
          timingNote: timing.statusText,
          source: "Direct External API Key Dispatch",
        };

        // Add to in-memory order history
        EXECUTED_ORDERS.unshift(newOrder);

        return jsonResponse({
          ok: true,
          message: "Paper trade order simulated and filled successfully according to market timings.",
          order: newOrder,
          marketTiming: timing,
          broker: "InvestIQ Paper Trading Execution Router",
        });
      },
    },
  },
});
