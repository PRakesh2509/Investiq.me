import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  validateAnyKey,
  generateId,
  jsonResponse,
  optionsResponse,
} from "@/lib/api-auth.server";
import {
  listOrders,
  saveOrder,
  type PaperOrder,
  type PriceSource,
} from "@/lib/orders-store.server";
import { WORKSTATION_INSTRUMENTS } from "@/lib/terminal-workstation.functions";
import {
  getMarketTiming,
  isDataLayerDown,
  type HighProfitTradeSetup,
  type MarketSetupsResult,
} from "@/lib/trade-analysis";
import {
  getGlobalHighProfitTrades,
  getIndianHighProfitTrades,
  getMarketHighProfitTrades,
  resolveInstrument,
} from "@/lib/trade-analysis.server";

export type { PaperOrder as ExecutedPaperOrder } from "@/lib/orders-store.server";

/** Status / reason / data-quality fields describing why setups are (not) available. */
function setupSummary(r: MarketSetupsResult) {
  return {
    setupStatus: r.status,
    setupReason: r.reason,
    setupDataQuality: r.dataQuality,
    setupsPerInstrument: r.perInstrument.map((p) => ({
      instrument: p.instrument,
      status: p.status,
      reason: p.reason,
    })),
  };
}

const GLOBAL_SYMBOLS = ["S&P 500", "NASDAQ 100", "DOW JONES"];
const MAX_LOTS = 1000;

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normContract = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const Route = createFileRoute("/api/v1/trades/order")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),

      // GET: Returns high-profit analyzed trades, Greeks, geopolitical context, market timings, and executed paper orders
      GET: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error: "Missing API Key. Pass 'x-api-key: <KEY>' or 'Authorization: Bearer <KEY>'.",
            },
            401,
            request,
          );
        }

        const { nse: isNseKey, global: isGlobalKey } = await validateAnyKey(key);

        if (!isNseKey && !isGlobalKey) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid API Key. Use your dedicated NSE F&O or GLOBAL API key.",
            },
            403,
            request,
          );
        }

        // Return trades filtered by key scope
        if (isNseKey && !isGlobalKey) {
          const [{ orders, persistence }, nse] = await Promise.all([
            listOrders({ market: "NSE_FNO" }),
            getIndianHighProfitTrades(),
          ]);
          return jsonResponse(
            {
              ok: true,
              market: "NSE_FNO",
              keyScope: "Indian Markets (NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, MIDCAP)",
              marketTiming: nse.timing,
              ...setupSummary(nse),
              highProfitTrades: nse.setups,
              executedPaperOrders: orders,
              persistence,
              instructions:
                "Take trades directly using POST /api/v1/trades/order or integrate into your paper trading webpage.",
              timestamp: new Date().toISOString(),
            },
            200,
            request,
          );
        }

        if (isGlobalKey && !isNseKey) {
          const [{ orders, persistence }, us] = await Promise.all([
            listOrders({ market: "GLOBAL_US" }),
            getGlobalHighProfitTrades(),
          ]);
          return jsonResponse(
            {
              ok: true,
              market: "GLOBAL_US",
              keyScope: "Global US Markets (S&P 500, NASDAQ 100, DOW JONES)",
              marketTiming: us.timing,
              ...setupSummary(us),
              highProfitTrades: us.setups,
              executedPaperOrders: orders,
              persistence,
              instructions:
                "Take trades directly using POST /api/v1/trades/order or integrate into your paper trading webpage.",
              timestamp: new Date().toISOString(),
            },
            200,
            request,
          );
        }

        // Both / Master
        const [{ orders, persistence }, nse, us] = await Promise.all([
          listOrders(),
          getIndianHighProfitTrades(),
          getGlobalHighProfitTrades(),
        ]);
        return jsonResponse(
          {
            ok: true,
            market: "ALL_MARKETS",
            marketTimings: {
              indianNSE: nse.timing,
              usGlobal: us.timing,
            },
            indianTrades: nse.setups,
            globalTrades: us.setups,
            indianSetupStatus: setupSummary(nse),
            globalSetupStatus: setupSummary(us),
            allExecutedPaperOrders: orders,
            persistence,
            timestamp: new Date().toISOString(),
          },
          200,
          request,
        );
      },

      // POST: Place & simulate an immediate paper trade order
      POST: async ({ request }) => {
        const key = extractApiKey(request);
        if (!key) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Missing API Key. Include 'x-api-key' header with your NSE F&O or GLOBAL API key.",
            },
            401,
            request,
          );
        }

        const { nse: isNseKey, global: isGlobalKey } = await validateAnyKey(key);

        if (!isNseKey && !isGlobalKey) {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid API key. Please check your API key from the InvestIQ Admin Panel.",
            },
            403,
            request,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            {
              ok: false,
              error:
                "Invalid JSON request body. Required fields: { symbol, contract, action, lots }",
            },
            400,
            request,
          );
        }
        if (!body || typeof body !== "object") {
          return jsonResponse(
            { ok: false, error: "Request body must be a JSON object." },
            400,
            request,
          );
        }

        const symbol =
          typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim() : "NIFTY 50";
        const contract = typeof body.contract === "string" ? body.contract.trim() : "";
        const action = String(body.action ?? "BUY").toUpperCase();
        const orderType = String(body.orderType ?? "MARKET").toUpperCase();
        const lots = body.lots === undefined ? 1 : Number(body.lots);

        const cfg = WORKSTATION_INSTRUMENTS[symbol];
        if (!cfg) {
          return jsonResponse(
            { ok: false, error: `Unsupported symbol '${symbol}'.` },
            400,
            request,
          );
        }
        if (action !== "BUY" && action !== "SELL") {
          return jsonResponse({ ok: false, error: "action must be BUY or SELL." }, 400, request);
        }
        if (orderType !== "MARKET" && orderType !== "LIMIT") {
          return jsonResponse(
            { ok: false, error: "orderType must be MARKET or LIMIT." },
            400,
            request,
          );
        }
        if (!Number.isInteger(lots) || lots < 1 || lots > MAX_LOTS) {
          return jsonResponse(
            { ok: false, error: `lots must be an integer between 1 and ${MAX_LOTS}.` },
            400,
            request,
          );
        }

        const isGlobalSymbol = GLOBAL_SYMBOLS.includes(symbol) || Boolean(cfg.isGlobal);

        // Scope check
        if (isGlobalSymbol && !isGlobalKey) {
          return jsonResponse(
            {
              ok: false,
              error: `Unauthorized: Symbol '${symbol}' requires a GLOBAL API key. Current key is an NSE F&O key.`,
            },
            403,
            request,
          );
        }

        if (!isGlobalSymbol && !isNseKey) {
          return jsonResponse(
            {
              ok: false,
              error: `Unauthorized: Symbol '${symbol}' requires an NSE F&O API key. Current key is a GLOBAL key.`,
            },
            403,
            request,
          );
        }

        const market = isGlobalSymbol ? "GLOBAL_US" : "NSE_FNO";

        // Setups are derived from live data; there is no built-in/fallback setup. A setup only
        // applies to BUY orders on the same contract (or when no contract was named).
        const analysisInstrument = resolveInstrument(symbol, market);
        const analysis: MarketSetupsResult = await getMarketHighProfitTrades(
          market,
          analysisInstrument ? { instruments: [analysisInstrument] } : {},
        );
        const setup: HighProfitTradeSetup | undefined =
          action === "BUY"
            ? analysis.setups.find(
                (t) =>
                  t.symbol === symbol &&
                  (!contract || normContract(t.contract) === normContract(contract)),
              )
            : undefined;

        // Fill price: LIMIT -> caller's limit price; MARKET -> the derived setup's entry premium
        // (ask side), else an explicit caller price. No randomness and no invented default price.
        const clientPrice = positive(body.price);
        let fillPrice: number | null = null;
        let priceSource: PriceSource = "trade_setup";
        if (orderType === "LIMIT") {
          fillPrice = clientPrice;
          priceSource = "limit_price";
          if (fillPrice === null) {
            return jsonResponse(
              { ok: false, error: "LIMIT orders require a positive 'price'." },
              400,
              request,
            );
          }
        } else if (setup) {
          fillPrice = setup.entryPrice;
        } else if (clientPrice !== null) {
          fillPrice = clientPrice;
          priceSource = "client_supplied";
        }
        if (fillPrice === null) {
          const per = analysis.perInstrument.find((p) => p.instrument === symbol);
          const reason =
            action === "SELL"
              ? "SELL orders have no derived setup price."
              : (per?.reason ?? analysis.reason);
          return jsonResponse(
            {
              ok: false,
              placed: false,
              error: `No valid trade setup for '${symbol}'${contract ? ` / '${contract}'` : ""}: ${reason} Supply a positive 'price' to place a manual paper order.`,
              status: per?.status ?? analysis.status,
              reason,
              dataQuality: per?.dataQuality ?? analysis.dataQuality,
              marketTiming: analysis.timing,
            },
            isDataLayerDown(analysis) ? 503 : 409,
            request,
          );
        }

        const orderContract = contract || setup?.contract || "";
        if (!orderContract) {
          return jsonResponse(
            {
              ok: false,
              placed: false,
              error: "contract is required when no derived trade setup is available.",
            },
            400,
            request,
          );
        }

        const lotSize = setup?.lotSize ?? cfg.lotSize;
        const totalQuantity = lots * lotSize;
        const timing = getMarketTiming(market);

        const newOrder: PaperOrder = {
          orderId: generateId("ORD"),
          status: "FILLED",
          market,
          symbol,
          contract: orderContract,
          action: action as "BUY" | "SELL",
          orderType,
          lots,
          lotSize,
          totalQuantity,
          fillPrice,
          currency: cfg.currency,
          totalOutlay: +(totalQuantity * fillPrice).toFixed(2),
          // Levels come from the caller or the matched setup; never invented.
          target1: positive(body.target1) ?? setup?.target1 ?? null,
          target2: positive(body.target2) ?? setup?.target2 ?? null,
          target3: positive(body.target3) ?? setup?.target3 ?? null,
          stopLoss: positive(body.stopLoss) ?? setup?.stopLossPrice ?? null,
          timestamp: new Date().toISOString(),
          timingNote: timing.statusText,
          source: "Direct External API Key Dispatch",
          priceSource,
          isSimulated: true,
        };

        const saved = await saveOrder(newOrder);

        return jsonResponse(
          {
            ok: true,
            message:
              "Paper trade order simulated and recorded (no real order was sent to any broker).",
            order: newOrder,
            persistence: saved.persistence,
            ...(saved.warning ? { warning: saved.warning } : {}),
            marketTiming: timing,
            broker: "InvestIQ Paper Trading Execution Router",
            isSimulated: true,
          },
          200,
          request,
        );
      },
    },
  },
});
