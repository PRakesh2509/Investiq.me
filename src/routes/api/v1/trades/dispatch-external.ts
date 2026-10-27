import { createFileRoute } from "@tanstack/react-router";
import {
  extractApiKey,
  generateId,
  getEnvKeys,
  jsonResponse,
  optionsResponse,
  validateAnyKey,
  validateOutboundUrl,
} from "@/lib/api-auth.server";
import { isAdminRequest, isSameOrigin } from "@/lib/admin-session.server";
import { appUrl } from "@/lib/app-url";
import {
  getActiveMarketByTiming,
  getMarketTiming,
  isDataLayerDown,
  selectSetup,
  type SetupStatus,
} from "@/lib/trade-analysis";
import { getMarketHighProfitTrades, resolveInstrument } from "@/lib/trade-analysis.server";

export const DEFAULT_LOVABLE_ENDPOINT =
  "https://637793ac-c049-46b9-aed4-edaff2e3ea91.lovableproject.com/api/public/investiq/trades";

const DISPATCH_TIMEOUT_MS = 12_000;

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

// Best-effort in-memory circular buffer for recent external dispatches (per isolate)
const MAX_LOGS = 50;
const EXTERNAL_DISPATCH_LOGS: ExternalDispatchLog[] = [];

function maskKeyStr(str: string): string {
  if (!str || str.length < 12) return "••••••••••••";
  return `${str.slice(0, 4)}${"•".repeat(8)}${str.slice(-4)}`;
}

type Market = "NSE_FNO" | "GLOBAL_US";

export interface ExternalPushResult {
  /** False when nothing was sent (validation / configuration failure); see `error`. */
  dispatched: boolean;
  ok: boolean;
  error?: string;
  /** HTTP status the caller should use when `dispatched` is false. */
  errorStatus?: number;
  httpStatus: number | null;
  statusText: string;
  durationMs: number;
  targetUrl: string;
  market: Market;
  keyUsed: string;
  dispatchedContract: string;
  payloadSent: Record<string, unknown> | null;
  responseSnippet: string;
  notes: string;
  logId: string | null;
  /** The pushed order is always a paper order. */
  isSimulated: true;
  /** Setup availability: SETUP_AVAILABLE when dispatched, otherwise why nothing was sent. */
  setupStatus?: SetupStatus;
  setupReason?: string;
}

function notDispatched(
  error: string,
  errorStatus: number,
  targetUrl: string,
  market: Market,
  startTime: number,
): ExternalPushResult {
  return {
    dispatched: false,
    ok: false,
    error,
    errorStatus,
    httpStatus: null,
    statusText: "Not dispatched",
    durationMs: Date.now() - startTime,
    targetUrl,
    market,
    keyUsed: "",
    dispatchedContract: "",
    payloadSent: null,
    responseSnippet: "",
    notes: error,
    logId: null,
    isSimulated: true,
  };
}

export async function executeExternalTradePush(options?: {
  targetUrl?: string;
  market?: "NSE_FNO" | "GLOBAL_US" | "AUTO";
  /** A key already validated by the caller (e.g. the caller's own API key). */
  apiKey?: string;
  /** Scopes the supplied `apiKey` was validated for. Required when `apiKey` is given. */
  apiKeyScopes?: { nse: boolean; global: boolean };
  symbol?: string;
}): Promise<ExternalPushResult> {
  const startTime = Date.now();
  const targetUrl = (options?.targetUrl || DEFAULT_LOVABLE_ENDPOINT).trim();

  // 1. Determine active market according to real-time market timings
  const timingResolution = getActiveMarketByTiming();
  const indianTiming = timingResolution.indianTiming;
  const globalTiming = timingResolution.globalTiming;

  let market: Market;
  if (options?.market === "NSE_FNO") {
    market = "NSE_FNO";
  } else if (options?.market === "GLOBAL_US") {
    market = "GLOBAL_US";
  } else {
    // AUTO: strictly follow real-time market timing
    market = timingResolution.activeMarket;
  }

  // 2. SSRF guard on the outbound target (https only, no private/metadata hosts, optional allowlist)
  const target = validateOutboundUrl(targetUrl);
  if (!target.ok) return notDispatched(target.reason, 400, targetUrl, market, startTime);

  // 3. Resolve API key: the authenticated caller's key, else the server's env key for the market.
  //    There are no built-in fallback keys.
  const scopeName = market === "GLOBAL_US" ? "global" : "nse";
  let apiKey = options?.apiKey?.trim() ?? "";
  if (apiKey) {
    if (!options?.apiKeyScopes?.[scopeName]) {
      return notDispatched(
        `The supplied API key is not authorized for ${market}.`,
        403,
        targetUrl,
        market,
        startTime,
      );
    }
  } else {
    apiKey = getEnvKeys(scopeName)[0] ?? "";
    if (!apiKey) {
      return notDispatched(
        `No ${market === "GLOBAL_US" ? "GLOBAL_API_KEY" : "NSE_FNO_API_KEY"} is configured on the server; supply an API key with the request.`,
        503,
        targetUrl,
        market,
        startTime,
      );
    }
  }

  // 4. Derive the trade setup from live data. With no valid setup nothing is dispatched.
  const symbolInstrument = resolveInstrument(options?.symbol, market);
  const analysis = await getMarketHighProfitTrades(
    market,
    symbolInstrument ? { instruments: [symbolInstrument] } : {},
  );
  const selection = selectSetup(
    analysis,
    options?.symbol ? (symbolInstrument ?? options.symbol) : null,
  );
  const selectedTrade = selection.setup;
  if (!selectedTrade) {
    const refused = notDispatched(
      `No valid trade setup to dispatch (${selection.status}): ${selection.reason}`,
      isDataLayerDown(analysis) ? 503 : 409,
      targetUrl,
      market,
      startTime,
    );
    return { ...refused, setupStatus: selection.status, setupReason: selection.reason };
  }

  // 5. Construct universal order payload for paper trading systems
  const orderId = generateId("AUTO");
  const timing = market === "GLOBAL_US" ? globalTiming : indianTiming;

  const payload = {
    source: "InvestIQ AI Trading Engine",
    version: "1.0",
    apiKey,
    orderId,
    executionMode: "AUTOMATIC_PUSH_WEBHOOK",
    manualClickRequired: false,
    isSimulated: true,
    status: "FILLED",
    market,
    marketSession: timing.statusText,
    isLiveMarketSession: timing.isRegularMarketOpen,
    activeMarketTimingReason: timingResolution.marketReason,
    currentISTTime: timing.currentISTTime,
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
    priceSource: "trade_setup",
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
    setupId: selectedTrade.tradeId,
    setupGeneratedAt: selectedTrade.generatedAt,
    dataSource: selectedTrade.dataSource,
    dataQuality: selectedTrade.dataQuality,
    calculation: selectedTrade.calculation,
    analysis: {
      strategy: selectedTrade.strategy,
      fnoChartTechnicals: selectedTrade.chartTechnicals,
      optionGreeks: selectedTrade.greeks,
      geopoliticalDrivers: selectedTrade.geopolitics,
      bestProfitRationale: selectedTrade.bestProfitRationale,
    },
  };

  // 6. Send POST to external endpoint with both x-api-key and Authorization header
  let httpStatus: number | null = null;
  let statusText = "Network Error";
  let responseSnippet = "";
  let success = false;
  let notes = "";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "x-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "InvestIQ-AutoTrade-Engine/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Never follow redirects: a redirect could point at an internal address.
      redirect: "manual",
    });

    httpStatus = response.status;
    statusText = response.statusText || `${response.status}`;
    const rawText = await response.text();
    responseSnippet = rawText.slice(0, 300);
    success = response.ok;

    if (response.status >= 300 && response.status < 400) {
      notes = "Target responded with a redirect; redirects are not followed for safety.";
    } else if (httpStatus === 401) {
      notes =
        "Lovable preview sandbox requires project authentication. To receive webhook posts: click 'Publish' in your Lovable project to make it public, or use the pull integration method.";
    } else if (response.ok) {
      notes = "Trade successfully accepted by external paper trading endpoint!";
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    statusText =
      e?.name === "AbortError"
        ? `Timeout (${DISPATCH_TIMEOUT_MS / 1000}s)`
        : e?.message || "Connection Failed";
    responseSnippet = `Error: ${statusText}`;
    notes = `Dispatch error: ${statusText}`;
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startTime;

  // 7. Record to dispatch log history
  const logEntry: ExternalDispatchLog = {
    id: generateId("disp"),
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

  // Never echo the API key back to the caller.

  const { apiKey: _redacted, ...payloadSent } = payload;

  return {
    dispatched: true,
    ok: success,
    httpStatus,
    statusText,
    durationMs,
    targetUrl,
    market,
    keyUsed: maskKeyStr(apiKey),
    dispatchedContract: selectedTrade.contract,
    payloadSent,
    responseSnippet,
    notes,
    logId: logEntry.id,
    isSimulated: true,
    setupStatus: "SETUP_AVAILABLE",
    setupReason: selection.reason,
  };
}

type Caller =
  { kind: "admin" } | { kind: "key"; key: string; scopes: { nse: boolean; global: boolean } };

/** Authorize via admin session cookie (+ same-origin for POST) or a valid API key. */
async function authorize(request: Request, mutating: boolean): Promise<Caller | Response> {
  const key = extractApiKey(request);
  if (key) {
    const scopes = await validateAnyKey(key);
    if (scopes.nse || scopes.global) return { kind: "key", key, scopes };
    return jsonResponse({ ok: false, error: "Invalid API Key." }, 403, request);
  }
  if (await isAdminRequest(request)) {
    if (mutating && !isSameOrigin(request)) {
      return jsonResponse({ ok: false, error: "Cross-origin request rejected." }, 403, request);
    }
    return { kind: "admin" };
  }
  return jsonResponse(
    { ok: false, error: "Authentication required (admin session or API key)." },
    401,
    request,
  );
}

export const Route = createFileRoute("/api/v1/trades/dispatch-external")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),

      /**
       * GET /api/v1/trades/dispatch-external
       * Returns recent dispatch logs, active endpoint, and automated status.
       * Requires an admin session or a valid API key. Never returns API keys.
       */
      GET: async ({ request }) => {
        const caller = await authorize(request, false);
        if (caller instanceof Response) return caller;

        const url = new URL(request.url);
        const parsedLimit = parseInt(url.searchParams.get("limit") || "20", 10);
        const limit = Math.min(50, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 20));

        return jsonResponse(
          {
            ok: true,
            configuredTargetEndpoint: DEFAULT_LOVABLE_ENDPOINT,
            marketTimings: {
              indian: getMarketTiming("NSE_FNO"),
              global: getMarketTiming("GLOBAL_US"),
            },
            recentDispatches: EXTERNAL_DISPATCH_LOGS.slice(0, limit),
            totalDispatchesRecorded: EXTERNAL_DISPATCH_LOGS.length,
            integrationGuide: {
              description:
                "Automatically push best trades directly to external paper trading endpoints",
              targetUrl: DEFAULT_LOVABLE_ENDPOINT,
              keys: "Use the NSE F&O / GLOBAL API keys issued in the Admin Panel (never exposed by this endpoint).",
              pullEndpointAlternative: appUrl("/api/v1/trades/auto"),
            },
            timestamp: new Date().toISOString(),
          },
          200,
          request,
        );
      },

      /**
       * POST /api/v1/trades/dispatch-external
       * Executes an immediate automatic (paper) trade push to the external endpoint.
       */
      POST: async ({ request }) => {
        const caller = await authorize(request, true);
        if (caller instanceof Response) return caller;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        if (!body || typeof body !== "object") body = {};

        let apiKey: string | undefined;
        let apiKeyScopes: { nse: boolean; global: boolean } | undefined;
        if (caller.kind === "key") {
          apiKey = caller.key;
          apiKeyScopes = caller.scopes;
        } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
          // Admin supplied a key explicitly: it must be a currently valid key.
          const scopes = await validateAnyKey(body.apiKey.trim());
          if (!scopes.nse && !scopes.global) {
            return jsonResponse(
              { ok: false, error: "Supplied apiKey is not valid." },
              400,
              request,
            );
          }
          apiKey = body.apiKey.trim();
          apiKeyScopes = scopes;
        }

        const requestedMarket =
          body.market === "NSE_FNO" || body.market === "GLOBAL_US" ? body.market : "AUTO";

        const result = await executeExternalTradePush({
          targetUrl:
            typeof body.targetUrl === "string" && body.targetUrl.trim()
              ? body.targetUrl
              : DEFAULT_LOVABLE_ENDPOINT,
          market: requestedMarket,
          apiKey,
          apiKeyScopes,
          symbol: typeof body.symbol === "string" ? body.symbol : undefined,
        });

        if (!result.dispatched) {
          return jsonResponse(
            {
              ok: false,
              dispatched: false,
              error: result.error,
              status: result.setupStatus,
              reason: result.setupReason ?? result.error,
              result,
              timestamp: new Date().toISOString(),
            },
            result.errorStatus ?? 400,
            request,
          );
        }

        return jsonResponse(
          {
            ok: result.ok,
            message: result.ok
              ? "Automatic trade successfully dispatched to external paper trading endpoint."
              : `Dispatched trade to external endpoint. Result: ${result.httpStatus || result.statusText}`,
            result,
            timestamp: new Date().toISOString(),
          },
          200,
          request,
        );
      },
    },
  },
});
