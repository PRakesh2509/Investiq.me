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
import { fetchYahooChart } from "./market-data-provider.server.ts";
import { allowMockData, isValidSymbol, safeErrorMessage } from "./provider-utils.ts";

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
      feedSource: "NSE Live Feed (DhanHQ Offline)",
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

  return { ok: true, message: "Disconnected DhanHQ. Reverted to NSE live feed." };
});

/**
 * Fetch enriched user portfolio holdings from DhanHQ v2
 */
export const getDhanHoldings = createServerFn({ method: "GET" }).handler(async () => {
  // Holdings belong to the broker account owner: never serve them to anonymous visitors.
  if (!(await isAdminCaller())) {
    return {
      ok: true,
      connected: false,
      isDemo: false,
      clientId: "",
      holdings: [],
      summary: { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 },
      message: ADMIN_REQUIRED_MESSAGE,
    };
  }
  try {
    return await getDhanEnrichedHoldings();
  } catch (e) {
    const mock = allowMockData();
    return {
      ok: true,
      connected: false,
      isDemo: mock,
      clientId: process.env.DHAN_CLIENT_ID?.trim() || "",
      holdings: mock ? DEMO_DHAN_HOLDINGS : [],
      summary: mock
        ? DEMO_DHAN_SUMMARY
        : { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 },
      message: safeErrorMessage(e, "Failed to load holdings"),
    };
  }
});

function yahooSymbolFor(cleanSym: string): string {
  const upper = cleanSym.toUpperCase();
  if (upper === "NIFTY" || upper === "NIFTY 50" || upper === "NIFTY50") return "^NSEI";
  if (upper === "BANKNIFTY" || upper === "BANK NIFTY") return "^NSEBANK";
  if (upper === "SENSEX") return "^BSESN";
  if (upper === "FINNIFTY") return "NIFTY_FIN_SERVICE.NS";
  return `${cleanSym}.NS`;
}

/**
 * Live chart data: DhanHQ candles first, then Yahoo Finance. `source` says which one answered.
 */
export const getDhanLiveChart = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        symbol: SymbolSchema,
        dhanSymbol: SymbolSchema.optional(),
        growwSymbol: SymbolSchema.optional(), // backwards compat alias
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

    // 1. DhanHQ first
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
          source: "dhan" as "dhan" | "yahoo",
          isSimulated: false,
          points,
          previousClose: points[0]?.price ?? 0,
        };
      }
    } catch {
      /* fall through to Yahoo */
    }

    // 2. Yahoo Finance (delayed) so the chart still renders with real data
    const intervalStr =
      data.intervalMinutes >= 1440
        ? "1d"
        : data.intervalMinutes >= 60
          ? "60m"
          : data.intervalMinutes >= 15
            ? "15m"
            : "5m";
    const rangeStr = data.days > 30 ? "3mo" : data.days > 5 ? "1mo" : data.days > 1 ? "5d" : "1d";
    const y = await fetchYahooChart(yahooSymbolFor(cleanSym), intervalStr, rangeStr);
    if (y && y.chart.points.length > 0) {
      const points: DhanChartPoint[] = y.chart.points.map((p) => ({
        t: p.time * 1000,
        price: +p.close.toFixed(2),
        volume: p.volume,
      }));
      const prev = y.chart.meta.previousClose ?? y.chart.meta.chartPreviousClose ?? points[0].price;
      return {
        ok: true as const,
        source: "yahoo" as "dhan" | "yahoo",
        isSimulated: false,
        points,
        previousClose: prev || points[0].price,
      };
    }

    return {
      ok: false as const,
      error: "No chart data available from DhanHQ or Yahoo Finance for this interval",
    };
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
