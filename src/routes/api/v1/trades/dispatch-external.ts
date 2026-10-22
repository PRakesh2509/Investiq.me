import { createFileRoute } from "@tanstack/react-router";
import {
  DEFAULT_NSE_FNO_KEY,
  DEFAULT_GLOBAL_KEY,
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
  type HighProfitTradeSetup,
} from "@/lib/trade-analysis";

export const DEFAULT_LOVABLE_ENDPOINT =
  "https://637793ac-c049-46b9-aed4-edaff2e3ea91.lovableproject.com/api/public/investiq/trades";

export interface ExternalDispatchLog {
  id: string;
  timestamp: string;
  targetUrl: string;
  market: "NSE_FNO" | "GLOBAL_US";
  symbol: string;
  contract: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  target2: number;
  keyUsedMasked: string;
  httpStatus: number | null;
  statusText: string;
  durationMs: number;
  responseSnippet: string;
  success: boolean;
  notes?: string;
}

// In-memory circular buffer for recent external dispatches
const MAX_LOGS = 50;
const EXTERNAL_DISPATCH_LOGS: ExternalDispatchLog[] = [];

function maskKeyStr(str: string): string {
  if (!str || str.length < 10) return "••••••••••••";
  return `${str.slice(0, 8)}${"•".repeat(Math.max(8, str.length - 12))}${str.slice(-4)}`;
}

export async function executeExternalTradePush(options?: {
  targetUrl?: string;
  market?: "NSE_FNO" | "GLOBAL_US" | "AUTO";
  customApiKey?: string;
  symbol?: string;
}) {
  const startTime = Date.now();
  const targetUrl = (options?.targetUrl || DEFAULT_LOVABLE_ENDPOINT).trim();

  // 1. Determine active market
  const indianTiming = getMarketTiming("NSE_FNO");
  const globalTiming = getMarketTiming("GLOBAL_US");

  let market: "NSE_FNO" | "GLOBAL_US";
  if (options?.market === "NSE_FNO") {
    market = "NSE_FNO";
  } else if (options?.market === "GLOBAL_US") {
    market = "GLOBAL_US";
  } else {
    // AUTO: If US regular or pre-market is open, use GLOBAL_US; otherwise use NSE_FNO
    if (globalTiming.isRegularMarketOpen || globalTiming.isPreMarketOpen) {
      market = "GLOBAL_US";
    } else {
      market = "NSE_FNO";
    }
  }

  // 2. Select trade setup
  const trades = market === "GLOBAL_US" ? getGlobalHighProfitTrades() : getIndianHighProfitTrades();
  const selectedTrade: HighProfitTradeSetup =
    (options?.symbol
      ? trades.find((t) => t.symbol.toUpperCase() === options.symbol?.toUpperCase())
      : null) || trades[0];

  // 3. Resolve API key
  let apiKey = options?.customApiKey?.trim();
  if (!apiKey) {
    apiKey = market === "GLOBAL_US" ? DEFAULT_GLOBAL_KEY : DEFAULT_NSE_FNO_KEY;
  }

  // 4. Construct universal order payload for paper trading systems
  const orderId = `AUTO_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const timing = market === "GLOBAL_US" ? globalTiming : indianTiming;

  const payload = {
    source: "InvestIQ AI Trading Engine",
    version: "1.0",
    apiKey,
    orderId,
    executionMode: "AUTOMATIC_PUSH_WEBHOOK",
    manualClickRequired: false,
    status: "FILLED",
    market,
    marketSession: timing.statusText,
    symbol: selectedTrade.symbol,
    contract: selectedTrade.contract,
    instrument: selectedTrade.contract,
    action: selectedTrade.action,
    side: selectedTrade.action,
    type: "MARKET",
    optionType: selectedTrade.optionType,
    lots: 2,
    lotSize: selectedTrade.lotSize,
    quantity: 2 * selectedTrade.lotSize,
    entryPrice: selectedTrade.entryPrice,
    fillPrice: selectedTrade.entryPrice,
    price: selectedTrade.entryPrice,
    currency: selectedTrade.currency,
    totalOutlay: +(2 * selectedTrade.lotSize * selectedTrade.entryPrice).toFixed(2),
    stopLoss: selectedTrade.stopLossPrice,
    stopLossPrice: selectedTrade.stopLossPrice,
    target1: selectedTrade.target1,
    target2: selectedTrade.target2,
    target3: selectedTrade.target3,
    targetPrice: selectedTrade.target2,
    riskRewardRatio: selectedTrade.riskRewardRatio,
    expectedProfitPct: selectedTrade.expectedProfitPctT2,
    timestamp: new Date().toISOString(),
    analysis: {
      strategy: selectedTrade.strategy,
      fnoChartTechnicals: selectedTrade.chartTechnicals,
      optionGreeks: selectedTrade.greeks,
      geopoliticalDrivers: selectedTrade.geopolitics,
      bestProfitRationale: selectedTrade.bestProfitRationale,
    },
  };

  // 5. Send POST to external endpoint with both x-api-key and Authorization header
  let httpStatus: number | null = null;
  let statusText = "Network Error";
  let responseSnippet = "";
  let success = false;
  let notes = "";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "x-api-key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "InvestIQ-AutoTrade-Engine/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    httpStatus = response.status;
    statusText = response.statusText || `${response.status}`;
    const rawText = await response.text();
    responseSnippet = rawText.slice(0, 300);
    success = response.ok;

    if (httpStatus === 401) {
      notes =
        "Lovable preview sandbox requires project authentication. To receive webhook posts: click 'Publish' in your Lovable project to make it public, or use the pull integration method.";
    } else if (response.ok) {
      notes = "Trade successfully accepted by external paper trading endpoint!";
    }
  } catch (err: any) {
    statusText = err?.name === "AbortError" ? "Timeout (12s)" : (err?.message || "Connection Failed");
    responseSnippet = `Error: ${statusText}`;
    notes = `Dispatch error: ${statusText}`;
  }

  const durationMs = Date.now() - startTime;

  // 6. Record to dispatch log history
  const logEntry: ExternalDispatchLog = {
    id: `disp_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    timestamp: new Date().toISOString(),
    targetUrl,
    market,
    symbol: selectedTrade.symbol,
    contract: selectedTrade.contract,
    action: selectedTrade.action,
    entryPrice: selectedTrade.entryPrice,
    target2: selectedTrade.target2,
    keyUsedMasked: maskKeyStr(apiKey),
    httpStatus,
    statusText,
    durationMs,
    responseSnippet,
    success,
    notes,
  };

  EXTERNAL_DISPATCH_LOGS.unshift(logEntry);
  if (EXTERNAL_DISPATCH_LOGS.length > MAX_LOGS) {
    EXTERNAL_DISPATCH_LOGS.pop();
  }

  return {
    ok: success,
    httpStatus,
    statusText,
    durationMs,
    targetUrl,
    market,
    keyUsed: maskKeyStr(apiKey),
    dispatchedContract: selectedTrade.contract,
    payloadSent: payload,
    responseSnippet,
    notes,
    logId: logEntry.id,
  };
}

export const Route = createFileRoute("/api/v1/trades/dispatch-external")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      /**
       * GET /api/v1/trades/dispatch-external
       * Returns recent dispatch logs, active endpoint, and automated status
       */
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

        const indianTiming = getMarketTiming("NSE_FNO");
        const globalTiming = getMarketTiming("GLOBAL_US");

        return jsonResponse({
          ok: true,
          configuredTargetEndpoint: DEFAULT_LOVABLE_ENDPOINT,
          marketTimings: {
            indian: indianTiming,
            global: globalTiming,
          },
          recentDispatches: EXTERNAL_DISPATCH_LOGS.slice(0, limit),
          totalDispatchesRecorded: EXTERNAL_DISPATCH_LOGS.length,
          integrationGuide: {
            description: "Automatically push best trades directly to external paper trading endpoints",
            targetUrl: DEFAULT_LOVABLE_ENDPOINT,
            nseFnoKey: DEFAULT_NSE_FNO_KEY,
            globalKey: DEFAULT_GLOBAL_KEY,
            pullEndpointAlternative: "https://www.investiqq.me/api/v1/trades/auto",
          },
          timestamp: new Date().toISOString(),
        });
      },

      /**
       * POST /api/v1/trades/dispatch-external
       * Executes an immediate automatic trade push to the external endpoint
       */
      POST: async ({ request }) => {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const result = await executeExternalTradePush({
          targetUrl: body?.targetUrl || DEFAULT_LOVABLE_ENDPOINT,
          market: body?.market || "AUTO",
          customApiKey: body?.apiKey,
          symbol: body?.symbol,
        });

        return jsonResponse({
          ok: result.ok,
          message: result.ok
            ? "Automatic trade successfully dispatched to external paper trading endpoint."
            : `Dispatched trade to external endpoint. Result: ${result.httpStatus || result.statusText}`,
          result,
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
