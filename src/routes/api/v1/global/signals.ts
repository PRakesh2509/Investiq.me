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
import {
  getGlobalHighProfitTrades,
  getMarketTiming,
} from "@/lib/trade-analysis";

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
        const marketTiming = getMarketTiming("GLOBAL_US");
        const highProfitTrades = getGlobalHighProfitTrades();
        const activeTrade = highProfitTrades.find((t) => t.symbol === instrument) || highProfitTrades[0];

        return jsonResponse({
          ok: true,
          market: "GLOBAL_INDICES",
          instrument,
          currency: cfg.currency,
          lotSize: cfg.lotSize,
          spotPrice: data.spotPrice,
          change: data.change,
          changePct: data.changePct,
          marketTiming,
          // 1. In-depth F&O / Index Chart Analysis
          fnoChartAnalysis: {
            timeframe: "Hourly & 4-Hour Trend Confluence",
            trend: activeTrade.chartTechnicals.trend,
            ema20: activeTrade.chartTechnicals.ema20,
            ema50: activeTrade.chartTechnicals.ema50,
            ema200: activeTrade.chartTechnicals.ema200,
            vwap: activeTrade.chartTechnicals.vwap,
            supertrend: activeTrade.chartTechnicals.supertrend,
            rsi14: activeTrade.chartTechnicals.rsi14,
            supportLevels: [activeTrade.chartTechnicals.support1, activeTrade.chartTechnicals.support2],
            resistanceLevels: [activeTrade.chartTechnicals.resistance1, activeTrade.chartTechnicals.resistance2],
            chartPattern: activeTrade.chartTechnicals.chartPattern,
            keyObservation: activeTrade.chartTechnicals.keyObservation,
          },
          // 2. Option Greeks View & Volatility
          greeksView: {
            atmStrike: activeTrade.greeks.atmStrike,
            callDelta: activeTrade.greeks.callDelta,
            putDelta: activeTrade.greeks.putDelta,
            gamma: activeTrade.greeks.gamma,
            thetaPerDay: activeTrade.greeks.thetaPerDay,
            vega: activeTrade.greeks.vega,
            ivPercentile: activeTrade.greeks.ivPercentile,
            pcrVolume: activeTrade.greeks.pcrVolume,
            pcrOpenInterest: activeTrade.greeks.pcrOpenInterest,
            maxPainStrike: activeTrade.greeks.maxPainStrike,
            oiBuildUpSummary: activeTrade.greeks.oiBuildUpSummary,
            greeksRecommendation: activeTrade.greeks.greeksRecommendation,
          },
          // 3. Geopolitical & Global Macro Backdrop
          geopoliticalAnalysis: {
            crudeOilImpact: activeTrade.geopolitics.crudeOilImpact,
            bondYieldAndDollarImpact: activeTrade.geopolitics.bondYieldAndDollarImpact,
            centralBankPolicyStance: activeTrade.geopolitics.centralBankPolicyStance,
            geopoliticalCatalyst: activeTrade.geopolitics.geopoliticalCatalyst,
            overallMacroSentiment: activeTrade.geopolitics.overallMacroSentiment,
            riskFactorScore: activeTrade.geopolitics.riskFactorScore,
          },
          // 4. Primary High-Profit Trade Recommendation
          bestProfitTradeSetup: {
            tradeId: activeTrade.tradeId,
            action: activeTrade.action,
            optionType: activeTrade.optionType,
            recommendedContract: activeTrade.contract,
            strategy: activeTrade.strategy,
            spotEntryTrigger: activeTrade.spotEntryTrigger,
            premiumEntryRange: activeTrade.premiumEntryRange,
            entryPrice: activeTrade.entryPrice,
            stopLossPrice: activeTrade.stopLossPrice,
            target1: activeTrade.target1,
            target2: activeTrade.target2,
            target3: activeTrade.target3,
            riskRewardRatio: activeTrade.riskRewardRatio,
            expectedProfitPctT2: activeTrade.expectedProfitPctT2,
            rationale: activeTrade.bestProfitRationale,
          },
          timestamp: new Date().toISOString(),
          paperTradingNote: "Send orders directly to POST /api/v1/trades/order with this API key to execute simulated paper trades.",
        });
      },
    },
  },
});
