import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateAnyKey,
  generateId,
  jsonResponse,
  optionsResponse,
} from "@/lib/api-auth.server";
import { saveOrder, type PaperOrder } from "@/lib/orders-store.server";
import { appUrl } from "@/lib/app-url";
import { isAdminRequest } from "@/lib/admin-session.server";
import {
  getActiveMarketByTiming,
  getMarketTiming,
  isDataLayerDown,
  selectSetup,
  type HighProfitTradeSetup,
  type MarketSetupsResult,
} from "@/lib/trade-analysis";
import { getMarketHighProfitTrades, resolveInstrument } from "@/lib/trade-analysis.server";

type Market = "NSE_FNO" | "GLOBAL_US";

const AUTO_LOTS = 2;

/** Pick the market for a key's scope. A key can never be used outside its own scope. */
function resolveMarket(
  scopes: { nse: boolean; global: boolean },
  requested: string | null | undefined,
): { market: Market } | { error: string } {
  const param = requested?.toUpperCase();
  let wanted: Market | null = null;
  if (param === "NSE" || param === "NSE_FNO" || param === "INDIA") wanted = "NSE_FNO";
  else if (param === "GLOBAL" || param === "GLOBAL_US" || param === "US" || param === "USA") {
    wanted = "GLOBAL_US";
  }

  if (wanted === "NSE_FNO" && !scopes.nse) {
    return { error: "This API key is not authorized for NSE F&O markets." };
  }
  if (wanted === "GLOBAL_US" && !scopes.global) {
    return { error: "This API key is not authorized for GLOBAL markets." };
  }
  if (wanted) return { market: wanted };
  if (scopes.nse && !scopes.global) return { market: "NSE_FNO" };
  if (scopes.global && !scopes.nse) return { market: "GLOBAL_US" };
  // Dynamic market selection according to the current IST trading session
  return { market: getActiveMarketByTiming().activeMarket };
}

type Scopes = { nse: boolean; global: boolean };

/** API key (any scope) or, for read-only GET, a valid admin session cookie. */
async function authorizeRead(request: Request): Promise<Scopes | "missing" | "invalid"> {
  const key = extractApiKey(request);
  if (key) {
    const scopes = await validateAnyKey(key);
    return scopes.nse || scopes.global ? scopes : "invalid";
  }
  if (await isAdminRequest(request)) return { nse: true, global: true };
  return "missing";
}

/** Evaluate the market (or one requested symbol) and pick the setup to act on. */
async function loadSelection(market: Market, requestedSymbol: string | null) {
  const instrument = resolveInstrument(requestedSymbol, market);
  const result: MarketSetupsResult = await getMarketHighProfitTrades(
    market,
    instrument ? { instruments: [instrument] } : {},
  );
  const selection = selectSetup(result, requestedSymbol ? (instrument ?? requestedSymbol) : null);
  return { result, selection };
}

/** Why no order was produced, as a response body shared by GET and POST. */
function refusalBody(
  market: Market,
  result: MarketSetupsResult,
  selection: { status: string; reason: string },
) {
  return {
    market,
    marketTiming: result.timing,
    status: selection.status,
    reason: selection.reason,
    dataQuality: result.dataQuality,
    perInstrument: result.perInstrument.map((r) => ({
      instrument: r.instrument,
      status: r.status,
      reason: r.reason,
    })),
    setups: [],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Shared order builder (previously duplicated per handler). Fill price is the trade setup's
 * entry price; there is no randomness. The order is a paper/simulated order.
 */
function buildAutoOrder(
  trade: HighProfitTradeSetup,
  market: Market,
  executionMode: string,
  timingNote: string,
) {
  const totalQuantity = AUTO_LOTS * trade.lotSize;
  return {
    orderId: generateId("AUTO"),
    status: "FILLED" as const,
    executionMode,
    manualClickRequired: false,
    market,
    symbol: trade.symbol,
    contract: trade.contract,
    action: trade.action,
    optionType: trade.optionType,
    lots: AUTO_LOTS,
    lotSize: trade.lotSize,
    totalQuantity,
    fillPrice: trade.entryPrice,
    priceSource: "trade_setup" as const,
    // Paper order: no broker order is ever sent. The market data behind it is real (see setup).
    isSimulated: true,
    currency: trade.currency,
    totalOutlay: +(totalQuantity * trade.entryPrice).toFixed(2),
    stopLoss: trade.stopLossPrice,
    target1: trade.target1,
    target2: trade.target2,
    target3: trade.target3,
    riskRewardRatio: trade.riskRewardRatio,
    expectedProfitPct: trade.expectedProfitPctT2,
    timestamp: new Date().toISOString(),
    timingSession: timingNote,
  };
}

function toPaperOrder(o: ReturnType<typeof buildAutoOrder>): PaperOrder {
  return {
    orderId: o.orderId,
    status: o.status,
    market: o.market,
    symbol: o.symbol,
    contract: o.contract,
    action: o.action,
    orderType: "MARKET",
    lots: o.lots,
    lotSize: o.lotSize,
    totalQuantity: o.totalQuantity,
    fillPrice: o.fillPrice,
    currency: o.currency,
    totalOutlay: o.totalOutlay,
    target1: o.target1,
    target2: o.target2,
    target3: o.target3,
    stopLoss: o.stopLoss,
    timestamp: o.timestamp,
    timingNote: o.timingSession,
    source: o.executionMode,
    priceSource: o.priceSource,
    isSimulated: true,
  };
}

export const Route = createFileRoute("/api/v1/trades/auto")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),

      /**
       * GET /api/v1/trades/auto
       * Automated trade delivery endpoint for external paper trading webpages.
       * Returns the best setup DERIVED from live option-chain, candle and Greeks data, only while
       * the market session is open. When no valid setup exists the response is still 200 with
       * `setups: []`, `autoOrder: null` and an explicit `status` / `reason` (503 only when the
       * market data layer is down). GET is read-only: it returns the order that WOULD be placed
       * (persisted: false); use POST to execute and persist it. Accepts an API key or an admin
       * session.
       */
      GET: async ({ request }) => {
        const scopes = await authorizeRead(request);
        if (scopes === "missing") {
          return jsonResponse(
            {
              ok: false,
              error:
                "Missing API Key. Include 'x-api-key: <YOUR_KEY>' or 'Authorization: Bearer <YOUR_KEY>'.",
              hint: "Use your 1st KEY for NSE F&O or 2nd KEY for GLOBAL.",
            },
            401,
            request,
          );
        }
        if (scopes === "invalid") {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid API Key. Authorization failed.",
              hint: "Check your API key in the InvestIQ Admin Panel.",
            },
            403,
            request,
          );
        }

        const url = new URL(request.url);
        const autoExecute = url.searchParams.get("autoExecute") !== "false";
        const requestedSymbol = url.searchParams.get("symbol");

        const resolved = resolveMarket(scopes, url.searchParams.get("market"));
        if ("error" in resolved) {
          return jsonResponse({ ok: false, error: resolved.error }, 403, request);
        }
        const { market } = resolved;

        const timing = getMarketTiming(market);
        const { result, selection } = await loadSelection(market, requestedSymbol);
        const primaryTrade = selection.setup;

        if (!primaryTrade) {
          const down = isDataLayerDown(result);
          return jsonResponse(
            {
              ok: !down,
              mode: "FULLY_AUTOMATIC",
              message: `No trade: ${selection.reason}`,
              autoOrder: null,
              bestTradeSetup: null,
              allAvailableSetups: [],
              ...(down ? { error: "Market data is currently unavailable." } : {}),
              ...refusalBody(market, result, selection),
            },
            down ? 503 : 200,
            request,
          );
        }

        const autoOrder = buildAutoOrder(
          primaryTrade,
          market,
          "AUTOMATIC_ALGO_DISPATCH",
          timing.statusText,
        );

        return jsonResponse(
          {
            ok: true,
            mode: "FULLY_AUTOMATIC",
            message:
              "Best setup derived from live option-chain, candle and Greeks data (paper order preview).",
            market,
            marketTiming: timing,
            status: "SETUP_AVAILABLE",
            reason: selection.reason,
            dataQuality: primaryTrade.dataQuality ?? result.dataQuality,
            autoOrder: autoExecute ? { ...autoOrder, persisted: false } : null,
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
              generatedAt: primaryTrade.generatedAt,
              calculation: primaryTrade.calculation,
              // In-depth Analysis Breakdown
              fnoChartTechnicals: primaryTrade.chartTechnicals,
              greeksView: primaryTrade.greeks,
              geopoliticalDrivers: primaryTrade.geopolitics,
              bestProfitRationale: primaryTrade.bestProfitRationale,
            },
            setups: result.setups,
            allAvailableSetups: result.setups.map((t) => ({
              symbol: t.symbol,
              contract: t.contract,
              action: t.action,
              entryPrice: t.entryPrice,
              target2: t.target2,
              expectedProfit: t.expectedProfitPctT2,
            })),
            perInstrument: result.perInstrument.map((r) => ({
              instrument: r.instrument,
              status: r.status,
              reason: r.reason,
            })),
            integrationSnippet: {
              description:
                "To poll for new setups every 30 seconds on your paper trading webpage, copy this snippet (replace <YOUR_API_KEY>; keep the key server-side where possible). data.autoOrder is null when there is no valid setup; check data.status / data.reason:",
              jsFetch: `// 30-sec polling snippet for an external paper trading webpage
setInterval(async () => {
  const res = await fetch("${appUrl("/api/v1/trades/auto")}", {
    headers: { "x-api-key": "<YOUR_API_KEY>" }
  });
  const data = await res.json();
  if (data.ok && data.autoOrder) {
    console.log("Setup received:", data.autoOrder.contract, "at", data.autoOrder.fillPrice);
    // Mirror order in your paper trading state / DOM:
    window.dispatchEvent(new CustomEvent("new-paper-trade", { detail: data.autoOrder }));
  } else {
    console.log("No trade:", data.status, data.reason);
  }
}, 30000);`,
            },
            timestamp: new Date().toISOString(),
          },
          200,
          request,
        );
      },

      /**
       * POST /api/v1/trades/auto
       * Allows automated bots or external webhooks to trigger an automatic (paper) trade fill.
       * Refuses (409, or 503 when market data is down) when no valid setup exists. The order is
       * persisted through the orders store.
       */
      POST: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse({ ok: false, error: "Missing API Key." }, 401, request);
        }

        const scopes = await validateAnyKey(key);
        if (!scopes.nse && !scopes.global) {
          return jsonResponse({ ok: false, error: "Invalid API Key." }, 403, request);
        }

        const params = new URL(request.url).searchParams;
        const resolved = resolveMarket(scopes, params.get("market"));
        if ("error" in resolved) {
          return jsonResponse({ ok: false, error: resolved.error }, 403, request);
        }
        const { market } = resolved;

        const timing = getMarketTiming(market);
        const { result, selection } = await loadSelection(market, params.get("symbol"));
        const primaryTrade = selection.setup;

        if (!primaryTrade) {
          return jsonResponse(
            {
              ok: false,
              placed: false,
              error: `No valid trade setup: ${selection.reason}`,
              ...refusalBody(market, result, selection),
            },
            isDataLayerDown(result) ? 503 : 409,
            request,
          );
        }

        const autoOrder = buildAutoOrder(
          primaryTrade,
          market,
          "AUTOMATIC_WEBHOOK_FILL",
          timing.statusText,
        );
        const saved = await saveOrder(toPaperOrder(autoOrder));

        return jsonResponse(
          {
            ok: true,
            placed: true,
            mode: "FULLY_AUTOMATIC",
            message:
              "Automatic paper trade recorded (simulated fill at the setup's ask-side entry premium; no broker order was sent).",
            order: { ...autoOrder, persisted: saved.persistence === "supabase" },
            persistence: saved.persistence,
            ...(saved.warning ? { warning: saved.warning } : {}),
            status: "SETUP_AVAILABLE",
            dataQuality: primaryTrade.dataQuality ?? result.dataQuality,
            analysis: {
              chart: primaryTrade.chartTechnicals.keyObservation,
              greeks: `Net delta: ${primaryTrade.calculation?.netDelta ?? "n/a"}, Theta: ${primaryTrade.greeks.thetaPerDay}/day, PCR (OI): ${primaryTrade.greeks.pcrOpenInterest}`,
              macro: primaryTrade.geopolitics?.summary ?? null,
            },
          },
          200,
          request,
        );
      },
    },
  },
});
