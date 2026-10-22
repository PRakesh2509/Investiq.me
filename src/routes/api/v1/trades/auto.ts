import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateNseFnoKey,
  validateGlobalKey,
  jsonResponse,
  CORS_HEADERS,
} from "@/lib/api-auth.server";
import {
  getIndianHighProfitTrades,
  getGlobalHighProfitTrades,
  getMarketTiming,
  getActiveMarketByTiming,
  type HighProfitTradeSetup,
} from "@/lib/trade-analysis";

export const Route = createFileRoute("/api/v1/trades/auto")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      /**
       * GET /api/v1/trades/auto
       * Fully automated trade delivery endpoint for external paper trading webpages.
       * Requires zero manual dispatch: automatically analyzes charts, Greeks, and geopolitics
       * and returns the best profit trade setup strictly according to market timings.
       */
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error: "Missing API Key. Include 'x-api-key: <YOUR_KEY>' header or '?apiKey=<YOUR_KEY>'.",
              hint: "Use your 1st KEY for NSE F&O or 2nd KEY for GLOBAL.",
            },
            401
          );
        }

        const isNse = validateNseFnoKey(key);
        const isGlobal = validateGlobalKey(key);

        if (!isNse && !isGlobal) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid API Key. Authorization failed.",
              hint: "Check your API key in the InvestIQ Admin Panel.",
            },
            403
          );
        }

        const url = new URL(request.url);
        const autoExecute = url.searchParams.get("autoExecute") !== "false";
        const requestedSymbol = url.searchParams.get("symbol");
        const requestedMarketParam = url.searchParams.get("market")?.toUpperCase();

        // 1. Determine Market according to real-time Market Timings:
        // Indian Market: 09:15 AM - 03:30 PM IST
        // US Market: 07:00 PM - 01:30 AM IST (Pre-market 04:00 PM - 07:00 PM IST)
        const timingResolution = getActiveMarketByTiming();

        let market: "NSE_FNO" | "GLOBAL_US";
        if (
          requestedMarketParam === "NSE" ||
          requestedMarketParam === "NSE_FNO" ||
          requestedMarketParam === "INDIA"
        ) {
          market = "NSE_FNO";
        } else if (
          requestedMarketParam === "GLOBAL" ||
          requestedMarketParam === "GLOBAL_US" ||
          requestedMarketParam === "US" ||
          requestedMarketParam === "USA"
        ) {
          market = "GLOBAL_US";
        } else if (isGlobal && !isNse) {
          market = "GLOBAL_US";
        } else if (isNse && !isGlobal && requestedMarketParam) {
          market = "NSE_FNO";
        } else {
          // Dynamic market selection according to current IST trading session:
          market = timingResolution.activeMarket;
        }

        const timing = getMarketTiming(market);
        const allTrades = market === "GLOBAL_US" ? getGlobalHighProfitTrades() : getIndianHighProfitTrades();

        // Filter by requested symbol if provided, otherwise pick the #1 highest conviction trade
        const primaryTrade: HighProfitTradeSetup =
          (requestedSymbol
            ? allTrades.find((t) => t.symbol.toUpperCase() === requestedSymbol.toUpperCase())
            : null) || allTrades[0];

        // 2. Generate Automated Order Object
        const autoOrderId = `AUTO_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const autoOrder = {
          orderId: autoOrderId,
          status: "FILLED",
          executionMode: "AUTOMATIC_ALGO_DISPATCH",
          manualClickRequired: false,
          market,
          symbol: primaryTrade.symbol,
          contract: primaryTrade.contract,
          action: primaryTrade.action,
          optionType: primaryTrade.optionType,
          lots: 2,
          lotSize: primaryTrade.lotSize,
          totalQuantity: 2 * primaryTrade.lotSize,
          fillPrice: primaryTrade.entryPrice,
          currency: primaryTrade.currency,
          totalOutlay: +(2 * primaryTrade.lotSize * primaryTrade.entryPrice).toFixed(2),
          stopLoss: primaryTrade.stopLossPrice,
          target1: primaryTrade.target1,
          target2: primaryTrade.target2,
          target3: primaryTrade.target3,
          riskRewardRatio: primaryTrade.riskRewardRatio,
          expectedProfitPct: primaryTrade.expectedProfitPctT2,
          timestamp: new Date().toISOString(),
          timingSession: timing.statusText,
        };

        return jsonResponse({
          ok: true,
          mode: "FULLY_AUTOMATIC",
          message: "Best profit trade automatically analyzed and delivered without manual intervention.",
          market,
          marketTiming: timing,
          autoOrder: autoExecute ? autoOrder : null,
          bestTradeSetup: {
            tradeId: primaryTrade.tradeId,
            symbol: primaryTrade.symbol,
            contract: primaryTrade.contract,
            action: primaryTrade.action,
            strategy: primaryTrade.strategy,
            entryPrice: primaryTrade.entryPrice,
            stopLoss: primaryTrade.stopLossPrice,
            target1: primaryTrade.target1,
            target2: primaryTrade.target2,
            target3: primaryTrade.target3,
            expectedProfit: primaryTrade.expectedProfitPctT2,
            riskRewardRatio: primaryTrade.riskRewardRatio,
            // In-depth Analysis Breakdown
            fnoChartTechnicals: primaryTrade.chartTechnicals,
            greeksView: primaryTrade.greeks,
            geopoliticalDrivers: primaryTrade.geopolitics,
            bestProfitRationale: primaryTrade.bestProfitRationale,
          },
          allAvailableSetups: allTrades.map((t) => ({
            symbol: t.symbol,
            contract: t.contract,
            action: t.action,
            entryPrice: t.entryPrice,
            target2: t.target2,
            expectedProfit: t.expectedProfitPctT2,
          })),
          integrationSnippet: {
            description: "To auto-take trades every 30 seconds on your paper trading webpage, copy this snippet:",
            jsFetch: `// Automatic 30-sec polling snippet for external paper trading webpage
setInterval(async () => {
  const res = await fetch("https://www.investiqq.me/api/v1/trades/auto", {
    headers: { "x-api-key": "${key}" }
  });
  const data = await res.json();
  if (data.ok && data.autoOrder) {
    console.log("Automatic Trade Received:", data.autoOrder.contract, "at", data.autoOrder.fillPrice);
    // Mirror order in your paper trading state / DOM:
    window.dispatchEvent(new CustomEvent("new-paper-trade", { detail: data.autoOrder }));
  }
}, 30000);`,
          },
          timestamp: new Date().toISOString(),
        });
      },

      /**
       * POST /api/v1/trades/auto
       * Allows automated bots or external webhooks to trigger an automatic trade fill
       */
      POST: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse({ ok: false, error: "Missing API Key." }, 401);
        }

        const isNse = validateNseFnoKey(key);
        const isGlobal = validateGlobalKey(key);

        if (!isNse && !isGlobal) {
          return jsonResponse({ ok: false, error: "Invalid API Key." }, 403);
        }

        const timingResolution = getActiveMarketByTiming();
        const market = isGlobal && !isNse ? "GLOBAL_US" : timingResolution.activeMarket;
        const timing = getMarketTiming(market);
        const allTrades = market === "GLOBAL_US" ? getGlobalHighProfitTrades() : getIndianHighProfitTrades();
        const primaryTrade = allTrades[0];

        const autoOrderId = `AUTO_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const autoOrder = {
          orderId: autoOrderId,
          status: "FILLED",
          executionMode: "AUTOMATIC_WEBHOOK_FILL",
          manualClickRequired: false,
          market,
          symbol: primaryTrade.symbol,
          contract: primaryTrade.contract,
          action: primaryTrade.action,
          optionType: primaryTrade.optionType,
          lots: 2,
          lotSize: primaryTrade.lotSize,
          totalQuantity: 2 * primaryTrade.lotSize,
          fillPrice: primaryTrade.entryPrice,
          currency: primaryTrade.currency,
          totalOutlay: +(2 * primaryTrade.lotSize * primaryTrade.entryPrice).toFixed(2),
          stopLoss: primaryTrade.stopLossPrice,
          target1: primaryTrade.target1,
          target2: primaryTrade.target2,
          target3: primaryTrade.target3,
          riskRewardRatio: primaryTrade.riskRewardRatio,
          expectedProfitPct: primaryTrade.expectedProfitPctT2,
          timestamp: new Date().toISOString(),
          timingSession: timing.statusText,
        };

        return jsonResponse({
          ok: true,
          mode: "FULLY_AUTOMATIC",
          message: "Automatic trade successfully executed and confirmed.",
          order: autoOrder,
          analysis: {
            chart: primaryTrade.chartTechnicals.keyObservation,
            greeks: `Delta: ${primaryTrade.greeks.putDelta || primaryTrade.greeks.callDelta}, Theta: ${primaryTrade.greeks.thetaPerDay}/day, PCR: ${primaryTrade.greeks.pcrVolume}`,
            geopolitics: primaryTrade.geopolitics.geopoliticalCatalyst,
          },
        });
      },
    },
  },
});
