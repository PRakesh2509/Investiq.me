import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getDhanCredentials,
  testDhanConnection,
  persistDhanCredentials,
  setDhanRuntimeCredentials,
  getDhanEnrichedHoldings,
  getDhanPositions,
  getDhanFundLimits,
  getDhanChartCandles,
  getDhanQuote,
  writeDhanEnvFile,
  DEMO_DHAN_HOLDINGS,
  DEMO_DHAN_SUMMARY,
} from "./dhan.server.ts";
import { fetchDhanQuote, fetchDhanQuotes } from "./dhan-quotes.server.ts";
import { resolveDhanInstrument } from "./dhan-instrument-master.server.ts";
import { getVerifiedMarketNews } from "./market-news-service.server.ts";
import { allowMockData, isValidSymbol, parseSymbolList, safeErrorMessage } from "./provider-utils.ts";

export type DhanChartPoint = { t: number; price: number; volume: number };

const SymbolSchema = z.string().min(1).max(32).refine(isValidSymbol, { message: "Invalid symbol" });

/**
 * Browser-driven credential changes are only honoured in local development (or when
 * ALLOW_RUNTIME_DHAN_CONNECT=true). In production the worker is shared by every visitor, so
 * letting any caller swap the broker credentials would expose one account to everyone. Set
 * DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN as deployment secrets instead.
 */
function runtimeConnectAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_RUNTIME_DHAN_CONNECT === "true";
}

const ADMIN_REQUIRED_MESSAGE = "Admin login required to view broker account data.";

/** True when the current server-function request carries a valid admin session cookie. */
async function isAdminCaller(): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { requireAdmin } = await import("./admin-session.server.ts");
    return (await requireAdmin(getRequest())) === null;
  } catch {
    return false;
  }
}

export const getDhanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const envClientId = process.env.DHAN_CLIENT_ID?.trim() || "";
  const mask = (cid: string) => (cid.length > 4 ? `${cid.slice(0, 3)}****${cid.slice(-3)}` : cid);
  const creds = getDhanCredentials();
  if (!creds) {
    return {
      connected: false,
      clientId: null,
      configuredClientId: envClientId ? mask(envClientId) : "",
      feedSource: "DhanHQ Marketfeed (Offline / Demo)",
    };
  }

  const masked = mask(creds.clientId);
  return {
    connected: true,
    clientId: masked,
    configuredClientId: masked,
    feedSource: "DhanHQ Live Direct Feed v2",
  };
});

export const connectDhanAccount = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        clientId: z.string().trim().min(1, "Client ID is required").max(64),
        accessToken: z.string().trim().min(1, "Access Token is required").max(4096),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (!runtimeConnectAllowed()) {
      return {
        ok: false,
        message:
          "Connecting a DhanHQ account from the browser is disabled in production. Set the DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN secrets on the deployment instead.",
      };
    }
    const creds = {
      clientId: data.clientId.trim(),
      accessToken: data.accessToken.trim(),
    };

    const test = await testDhanConnection(creds);
    if (!test.ok) {
      return { ok: false, message: test.message || "Failed to authenticate with DhanHQ" };
    }

    const saved = persistDhanCredentials(creds);
    if (saved) await writeDhanEnvFile(creds);
    return {
      ok: true,
      message: "DhanHQ account connected! Direct live feed is now active.",
      savedToEnv: saved,
    };
  });

export const disconnectDhanAccount = createServerFn({ method: "POST" }).handler(async () => {
  if (!runtimeConnectAllowed()) {
    return {
      ok: false,
      message: "Disconnecting from the browser is disabled in production.",
    };
  }
  setDhanRuntimeCredentials(null);
  delete process.env.DHAN_CLIENT_ID;
  delete process.env.DHAN_ACCESS_TOKEN;
  await writeDhanEnvFile(null);

  return { ok: true, message: "Disconnected DhanHQ." };
});

/**
 * Fetch enriched user portfolio holdings from DhanHQ v2
 */
export const getDhanHoldings = createServerFn({ method: "GET" })
  .validator((d) => z.object({ symbol: SymbolSchema.optional() }).optional().parse(d))
  .handler(async () => {
    if (!(await isAdminCaller())) {
      return {
        ok: true,
        connected: false,
        isDemo: false,
        clientId: "",
        name: "Dhan Portfolio",
        holdings: [] as import("./dhan.server.ts").DhanHolding[],
        summary: { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 },
        sectorWeightings: [] as Array<{ name: string; pct: number }>,
        message: ADMIN_REQUIRED_MESSAGE,
      };
    }
    try {
      const res = await getDhanEnrichedHoldings();
      return {
        ...res,
        name: "Dhan Portfolio",
        sectorWeightings: [] as Array<{ name: string; pct: number }>,
      };
    } catch (e) {
      const mock = allowMockData();
      return {
        ok: true,
        connected: false,
        isDemo: mock,
        clientId: process.env.DHAN_CLIENT_ID?.trim() || "",
        name: "Dhan Portfolio",
        holdings: mock ? DEMO_DHAN_HOLDINGS : ([] as import("./dhan.server.ts").DhanHolding[]),
        summary: mock
          ? DEMO_DHAN_SUMMARY
          : { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 },
        sectorWeightings: [] as Array<{ name: string; pct: number }>,
        message: safeErrorMessage(e, "Failed to load holdings"),
      };
    }
  });

/**
 * Live chart data from DhanHQ candles (100% Dhan-backed).
 */
export const getDhanLiveChart = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        symbol: SymbolSchema,
        dhanSymbol: SymbolSchema.optional(),
        growwSymbol: SymbolSchema.optional(),
        exchange: z.enum(["NSE", "BSE"]).default("NSE"),
        intervalMinutes: z.number().int().min(1).max(1440).default(5),
        days: z.number().int().min(1).max(120).default(1),
        range: z.string().max(8).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const targetSymbol = data.dhanSymbol || data.growwSymbol || data.symbol;
    const cleanSym = targetSymbol.replace(/\^/g, "").replace(/\.NS$/i, "").replace(/\.BO$/i, "");
    const range = data.days > 5 ? (data.days > 30 ? "3mo" : "1mo") : data.days > 1 ? "5d" : "1d";

    try {
      const candles = await getDhanChartCandles(cleanSym, range, data.intervalMinutes);
      if (candles && candles.length > 0) {
        const points: DhanChartPoint[] = candles.map((c) => ({
          t: c.t,
          price: c.price,
          volume: c.volume,
        }));
        return {
          ok: true as const,
          source: "dhan" as const,
          isSimulated: false,
          points,
          previousClose: points[0]?.price ?? 0,
        };
      }
    } catch {
      // ignore
    }

    return {
      ok: false as const,
      error: "No chart data available from DhanHQ for this interval",
    };
  });

/**
 * Batch-fetches live quotes using DhanHQ
 */
export const getDhanQuotes = createServerFn({ method: "POST" })
  .validator((data) => z.object({ symbols: z.string().min(1).max(4000) }).parse(data))
  .handler(async ({ data }) => {
    const symbols = parseSymbolList(data.symbols, 120);
    if (symbols.length === 0) return { ok: false as const, error: "no valid symbols" };

    try {
      const quotes = await fetchDhanQuotes(symbols);
      const results = quotes
        .filter((q): q is NonNullable<typeof q> => q !== null && q.price > 0)
        .map((q) => {
          const inst = resolveDhanInstrument(q.symbol);
          return {
            symbol: q.symbol,
            name: inst?.name || q.symbol,
            price: q.price,
            change: q.change,
            changePct: q.changePct,
            volume: q.volume,
            marketCap: 0,
            marketCapFmt: "Not available from Dhan",
            pe: 0,
            high52: q.high52 ?? 0,
            low52: q.low52 ?? 0,
            freshnessStatus: "LIVE" as const,
          };
        });
      return { ok: true as const, quotes: results };
    } catch (e) {
      return { ok: false as const, error: safeErrorMessage(e) };
    }
  });

/**
 * Fundamentals from DhanHQ
 */
export const getDhanFundamentals = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: SymbolSchema }).parse(data))
  .handler(async ({ data }) => {
    const clean = data.symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").replace(/^\^/, "");
    const q = await fetchDhanQuote(clean);
    const inst = resolveDhanInstrument(clean);

    const result: {
      ok: boolean;
      name: string;
      sector: string;
      industry: string;
      summary: string;
      marketCap: number;
      marketCapFmt: string;
      peTTM: number;
      pbRatio: number;
      debtToEquity: number;
      roe: number;
      epsTTM: number;
      dividendYield: number;
      bookValue: number;
      priceToSales: number;
      profitMargin: number;
      revenueGrowth: number;
      earningsGrowth: number;
      fiftyTwoWeekHigh: number;
      fiftyTwoWeekLow: number;
      currency: string;
      recommendationKey: string;
      targetMean: number;
    } = {
      ok: true,
      name: inst?.name || clean,
      sector: inst?.segment || "Equities",
      industry: "Not available from Dhan",
      summary: `${inst?.name || clean} (${inst?.symbol || clean}) - Dhan Security ID: ${inst?.securityId || "Not available from Dhan"}. Segment: ${inst?.segment || "NSE_EQ"}. Lot Size: ${inst?.lotSize || 1}.`,
      marketCap: 0,
      marketCapFmt: "Not available from Dhan",
      peTTM: 0,
      pbRatio: 0,
      debtToEquity: 0,
      roe: 0,
      epsTTM: 0,
      dividendYield: 0,
      bookValue: 0,
      priceToSales: 0,
      profitMargin: 0,
      revenueGrowth: 0,
      earningsGrowth: 0,
      fiftyTwoWeekHigh: q?.high52 ?? 0,
      fiftyTwoWeekLow: q?.low52 ?? 0,
      currency: "INR",
      recommendationKey: "hold",
      targetMean: 0,
    };
    return result;
  });

/**
 * Financials from DhanHQ (not available)
 */
export const getDhanFinancials = createServerFn({ method: "GET" })
  .validator((data) => z.object({ symbol: SymbolSchema }).parse(data))
  .handler(async () => {
    return {
      ok: true as const,
      quarterly: [],
      yearly: [],
      message: "Not available from Dhan",
    };
  });

/**
 * Market intelligence & verified news
 */
export const getDhanNews = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        query: z.string().trim().min(1).max(80),
        count: z.number().int().min(1).max(20).default(10),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const newsItems = await getVerifiedMarketNews();
      const mapped = newsItems.slice(0, data.count).map((item) => ({
        title: item.headline,
        publisher: item.source,
        link: item.url,
        providerPublishTime: item.publishedAt ? new Date(item.publishedAt).getTime() : Date.now(),
        thumbnail: "",
      }));
      return { ok: true as const, items: mapped };
    } catch {
      return { ok: true as const, items: [] };
    }
  });

/**
 * Fetch live Dhan quote for a symbol
 */
export const getDhanQuoteFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ symbol: SymbolSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      const q = await getDhanQuote(data.symbol);
      return { ok: true as const, quote: q };
    } catch (e) {
      return { ok: false as const, error: safeErrorMessage(e, "quote failed") };
    }
  });

/**
 * Fetch Dhan positions
 */
export const getDhanPositionsFn = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminCaller())) {
    return { ok: false as const, error: ADMIN_REQUIRED_MESSAGE, positions: [] };
  }
  try {
    const positions = await getDhanPositions();
    return { ok: true as const, positions: positions || [] };
  } catch (e) {
    return { ok: false as const, error: safeErrorMessage(e, "positions failed"), positions: [] };
  }
});

/**
 * Fetch Dhan fund limits
 */
export const getDhanFundsFn = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminCaller())) {
    return { ok: false as const, error: ADMIN_REQUIRED_MESSAGE };
  }
  try {
    const funds = await getDhanFundLimits();
    return { ok: true as const, funds };
  } catch (e) {
    return { ok: false as const, error: safeErrorMessage(e, "fund limits failed") };
  }
});
