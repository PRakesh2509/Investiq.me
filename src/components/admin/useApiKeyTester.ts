import { useState } from "react";
import { toast } from "sonner";
import { useAdmin, type KeyScope } from "@/context/AdminContext";
import { maskApiKey } from "./admin-constants";

export type LiveActionType =
  | "NSE_FNO"
  | "GLOBAL"
  | "TRADE_ORDER"
  | "DISPATCH_NIFTY"
  | "DISPATCH_BANKNIFTY"
  | "DISPATCH_SPX"
  | "DISPATCH_NAS100"
  | "FETCH_ALL_TRADES"
  | "AUTO_TRADE_NSE"
  | "AUTO_TRADE_GLOBAL";

export interface TestResult {
  status: number;
  ok: boolean;
  endpoint?: string;
  keyUsed?: string;
  data?: unknown;
  error?: string;
}

interface TestSpec {
  scope: KeyScope;
  method: "GET" | "POST";
  path: string;
  label: string;
  body?: Record<string, unknown>;
  okMessage: string;
  failMessage: string;
}

const NIFTY_ORDER = {
  symbol: "NIFTY 50",
  contract: "NIFTY50 22850 PE",
  action: "BUY",
  lots: 2,
  price: 138.0,
  target1: 195.0,
  target2: 245.0,
  stopLoss: 98.0,
};

const TEST_SPECS: Record<LiveActionType, TestSpec> = {
  NSE_FNO: {
    scope: "nse",
    method: "GET",
    path: "/api/v1/fno/signals?instrument=NIFTY%2050",
    label: "GET /api/v1/fno/signals?instrument=NIFTY%2050",
    okMessage: "NSE F&O API Key & Market Analysis fetched!",
    failMessage: "NSE F&O API Key test failed",
  },
  GLOBAL: {
    scope: "global",
    method: "GET",
    path: "/api/v1/global/signals?instrument=S%26P%20500",
    label: "GET /api/v1/global/signals?instrument=S%26P%20500",
    okMessage: "GLOBAL API Key & US Market Analysis fetched!",
    failMessage: "GLOBAL API Key test failed",
  },
  TRADE_ORDER: {
    scope: "nse",
    method: "POST",
    path: "/api/v1/trades/order",
    label: "POST /api/v1/trades/order (NIFTY 50 - 1st Key)",
    body: NIFTY_ORDER,
    okMessage: "Dispatched Indian Trade: NIFTY 50 22850 PE to API Key!",
    failMessage: "Trade dispatch failed",
  },
  DISPATCH_NIFTY: {
    scope: "nse",
    method: "POST",
    path: "/api/v1/trades/order",
    label: "POST /api/v1/trades/order (NIFTY 50 - 1st Key)",
    body: NIFTY_ORDER,
    okMessage: "Dispatched Indian Trade: NIFTY 50 22850 PE to API Key!",
    failMessage: "Trade dispatch failed",
  },
  DISPATCH_BANKNIFTY: {
    scope: "nse",
    method: "POST",
    path: "/api/v1/trades/order",
    label: "POST /api/v1/trades/order (BANK NIFTY - 1st Key)",
    body: {
      symbol: "BANK NIFTY",
      contract: "BANKNIFTY 51200 CE",
      action: "BUY",
      lots: 2,
      price: 315.0,
      target1: 450.0,
      target2: 560.0,
      stopLoss: 220.0,
    },
    okMessage: "Dispatched Indian Trade: BANKNIFTY 51200 CE to API Key!",
    failMessage: "Trade dispatch failed",
  },
  DISPATCH_SPX: {
    scope: "global",
    method: "POST",
    path: "/api/v1/trades/order",
    label: "POST /api/v1/trades/order (S&P 500 - 2nd Key • US Live)",
    body: {
      symbol: "S&P 500",
      contract: "SPX 5870 CALL",
      action: "BUY",
      lots: 2,
      price: 28.5,
      target1: 45.0,
      target2: 62.0,
      stopLoss: 18.5,
    },
    okMessage: "Dispatched US Trade: SPX 5870 CALL to API Key (US Session Live)!",
    failMessage: "Trade dispatch failed",
  },
  DISPATCH_NAS100: {
    scope: "global",
    method: "POST",
    path: "/api/v1/trades/order",
    label: "POST /api/v1/trades/order (NASDAQ 100 - 2nd Key • US Live)",
    body: {
      symbol: "NASDAQ 100",
      contract: "NAS100 20450 CALL",
      action: "BUY",
      lots: 2,
      price: 50.0,
      target1: 78.0,
      target2: 105.0,
      stopLoss: 32.0,
    },
    okMessage: "Dispatched US Trade: NAS100 20450 CALL to API Key (US Session Live)!",
    failMessage: "Trade dispatch failed",
  },
  FETCH_ALL_TRADES: {
    scope: "nse",
    method: "GET",
    path: "/api/v1/trades/order",
    label: "GET /api/v1/trades/order (All Active Setups & Orders)",
    okMessage: "Fetched all active trades & market timing statuses!",
    failMessage: "Fetch trades failed",
  },
  AUTO_TRADE_NSE: {
    scope: "nse",
    method: "GET",
    path: "/api/v1/trades/auto",
    label: "GET /api/v1/trades/auto (Automatic Best Trade Delivery - 1st Key)",
    okMessage: "Automatic Best Trade generated & delivered (No manual click required)!",
    failMessage: "Auto trade fetch failed",
  },
  AUTO_TRADE_GLOBAL: {
    scope: "global",
    method: "GET",
    path: "/api/v1/trades/auto",
    label: "GET /api/v1/trades/auto (Automatic Best Trade Delivery - 2nd Key • US Live)",
    okMessage: "Automatic US Best Trade generated & delivered (No manual click required)!",
    failMessage: "Auto trade fetch failed",
  },
};

/** Runs live API calls against our own backend with the key held in memory for this session. */
export function useApiKeyTester() {
  const { settings } = useAdmin();
  const [testingEndpoint, setTestingEndpoint] = useState<LiveActionType | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const runLiveTest = async (type: LiveActionType) => {
    const spec = TEST_SPECS[type];
    const key = spec.scope === "nse" ? settings.nseFnoApiKey : settings.globalApiKey;
    if (!key) {
      toast.error(
        `No ${spec.scope === "nse" ? "NSE F&O" : "Global"} key in this session — rotate the key or use an existing one first`,
      );
      return;
    }
    setTestingEndpoint(type);
    setTestResult(null);
    try {
      const headers: Record<string, string> = { "x-api-key": key };
      if (spec.body) headers["Content-Type"] = "application/json";
      const res = await fetch(spec.path, {
        method: spec.method,
        headers,
        body: spec.body ? JSON.stringify(spec.body) : undefined,
      });
      const data = await res.json();
      setTestResult({
        status: res.status,
        ok: res.ok,
        endpoint: spec.label,
        keyUsed: maskApiKey(key),
        data,
      });
      if (res.ok) toast.success(spec.okMessage);
      else toast.error(spec.failMessage);
    } catch (e) {
      setTestResult({ status: 500, ok: false, error: (e as Error)?.message || "Network Error" });
      toast.error("Live test failed: network error");
    } finally {
      setTestingEndpoint(null);
    }
  };

  return { testingEndpoint, testResult, setTestResult, runLiveTest };
}
