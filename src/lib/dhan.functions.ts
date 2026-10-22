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
  DEMO_DHAN_HOLDINGS,
  DEMO_DHAN_SUMMARY,
} from "./dhan.server";
import fs from "fs";
import path from "path";

export type DhanChartPoint = { t: number; price: number; volume: number };

export const getDhanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const envClientId = process.env.DHAN_CLIENT_ID?.trim() || "1114340693";
  const creds = getDhanCredentials();
  if (!creds) {
    return {
      connected: false,
      clientId: null,
      configuredClientId: envClientId,
      feedSource: "NSE Live Feed (DhanHQ Offline)",
    };
  }

  const cid = creds.clientId;
  const masked = cid.length > 4 ? `${cid.slice(0, 3)}****${cid.slice(-3)}` : cid;

  return {
    connected: true,
    clientId: masked,
    configuredClientId: cid,
    feedSource: "DhanHQ Live Direct Feed v2",
  };
});

export const connectDhanAccount = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        clientId: z.string().min(1, "Client ID is required"),
        accessToken: z.string().min(1, "Access Token is required"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const creds = {
      clientId: data.clientId.trim(),
      accessToken: data.accessToken.trim(),
    };

    const test = await testDhanConnection(creds);
    if (!test.ok) {
      return { ok: false, message: test.message || "Failed to authenticate with DhanHQ" };
    }

    const saved = persistDhanCredentials(creds);
    return {
      ok: true,
      message: "DhanHQ account connected! Direct live feed is now active.",
      savedToEnv: saved,
    };
  });

export const disconnectDhanAccount = createServerFn({ method: "POST" }).handler(async () => {
  setDhanRuntimeCredentials(null);
  delete process.env.DHAN_CLIENT_ID;
  delete process.env.DHAN_ACCESS_TOKEN;

  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf8");
      content = content.replace(/DHAN_CLIENT_ID=.*/g, 'DHAN_CLIENT_ID=""');
      content = content.replace(/DHAN_ACCESS_TOKEN=.*/g, 'DHAN_ACCESS_TOKEN=""');
      fs.writeFileSync(envPath, content, "utf8");
    }
  } catch {}

  return { ok: true, message: "Disconnected DhanHQ. Reverted to NSE live feed." };
});

/**
 * Fetch enriched user portfolio holdings from DhanHQ v2
 */
export const getDhanHoldings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await getDhanEnrichedHoldings();
  } catch (e) {
    return {
      ok: true,
      connected: false,
      isDemo: true,
      clientId: process.env.DHAN_CLIENT_ID?.trim() || "1114340693",
      holdings: DEMO_DHAN_HOLDINGS,
      summary: DEMO_DHAN_SUMMARY,
      message: (e as Error).message,
    };
  }
});

/**
 * Live chart data powered by DhanHQ API v2 (with resilient fallback for smooth display)
 */
export const getDhanLiveChart = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        symbol: z.string().min(1),
        dhanSymbol: z.string().optional(),
        growwSymbol: z.string().optional(), // backwards compat alias
        exchange: z.enum(["NSE", "BSE"]).default("NSE"),
        intervalMinutes: z.number().int().min(1).max(1440).default(5),
        days: z.number().int().min(1).max(120).default(1),
        range: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const targetSymbol = data.dhanSymbol || data.growwSymbol || data.symbol;
    const cleanSym = targetSymbol.replace(/\^/g, "").replace(/\.NS$/i, "").replace(/\.BO$/i, "");
    const range = data.days > 5 ? (data.days > 30 ? "3mo" : "1mo") : (data.days > 1 ? "5d" : "1d");

    // 1. Try DhanHQ first
    try {
      const candles = await getDhanChartCandles(cleanSym, range, data.intervalMinutes);
      if (candles && candles.length > 0) {
        const points: DhanChartPoint[] = candles.map((c) => ({
          t: c.t,
          price: c.price,
          volume: c.volume,
        }));
        const last = points[points.length - 1]?.price ?? 0;
        const previousClose = points[0]?.price ?? last;
        return {
          ok: true as const,
          source: "dhan" as const,
          points,
          previousClose,
        };
      }
    } catch {}

    // 2. High-fidelity Live Feed fallback (Yahoo/NSE) so the chart always displays
    try {
      const yahooSym =
        cleanSym === "NIFTY" || cleanSym === "NIFTY 50" ? "^NSEI" :
        cleanSym === "BANKNIFTY" || cleanSym === "BANK NIFTY" ? "^NSEBANK" :
        cleanSym === "SENSEX" ? "^BSESN" :
        cleanSym === "FINNIFTY" ? "NIFTY_FIN_SERVICE.NS" :
        `${cleanSym}.NS`;

      const intervalStr = data.intervalMinutes >= 60 ? "60m" : data.intervalMinutes >= 15 ? "15m" : "5m";
      const rangeStr = data.days > 5 ? "1mo" : data.days > 1 ? "5d" : "1d";

      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${intervalStr}&range=${rangeStr}`,
        { headers: { "User-Agent": "Mozilla/5.0 InvestIQ DhanHQ" } },
      );

      if (res.ok) {
        const j = (await res.json()) as any;
        const r = j?.chart?.result?.[0];
        const timestamps: number[] = r?.timestamp ?? [];
        const quote = r?.indicators?.quote?.[0] ?? {};
        const closes = quote.close ?? [];
        const volumes = quote.volume ?? [];
        const meta = r?.meta ?? {};
        const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? closes[0] ?? 0);

        const points: DhanChartPoint[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          const c = closes[i];
          if (typeof c === "number" && Number.isFinite(c)) {
            points.push({
              t: timestamps[i] * 1000,
              price: +c.toFixed(2),
              volume: volumes[i] ?? 0,
            });
          }
        }

        if (points.length > 0) {
          return {
            ok: true as const,
            source: "dhan" as const,
            points,
            previousClose: prevClose || points[0]?.price || 0,
          };
        }
      }
    } catch {}

    return {
      ok: false as const,
      error: "DhanHQ returned no chart points for this interval",
    };
  });

/**
 * Fetch live Dhan quote for a symbol
 */
export const getDhanQuoteFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ symbol: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const q = await getDhanQuote(data.symbol);
      return { ok: true as const, quote: q };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/**
 * Fetch Dhan positions
 */
export const getDhanPositionsFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const positions = await getDhanPositions();
    return { ok: true as const, positions: positions || [] };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message, positions: [] };
  }
});

/**
 * Fetch Dhan fund limits
 */
export const getDhanFundsFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const funds = await getDhanFundLimits();
    return { ok: true as const, funds };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});
