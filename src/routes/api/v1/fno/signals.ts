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
import {
  getIndianHighProfitTrades,
  getMarketTiming,
} from "@/lib/trade-analysis";

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
        const marketTiming = getMarketTiming("NSE_FNO");
        const highProfitTrades = getIndianHighProfitTrades();
        const activeTrade = highProfitTrades.find((t) => t.symbol === instrument) || highProfitTrades[0];

        return jsonResponse({
          ok: true,
          market: "NSE_FNO",
          instrument,
          currency: cfg.currency,
          lotSize: cfg.lotSize,
          spotPrice: data.spotPrice,
          change: data.change,
          changePct: data.changePct,
          marketTiming,
          // 1. In-depth F&O Chart Analysis
          fnoChartAnalysis: {
            timeframe: "15-min & Hourly Technical Structure",
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
          // 2. Option Greeks View & Open Interest
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
          // 3. Geopolitical & Macroeconomic Impact
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
          // 5. Strike Chain (Greeks Ingestion)
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
          paperTradingNote: "Send orders directly to POST /api/v1/trades/order with this API key to execute simulated paper trades.",
        });
      },
    },
  },
});
