import { useCallback, useEffect, useState } from "react";
import type {
  HighProfitTradeSetup,
  MarketTimingInfo,
  SetupDataQuality,
  SetupStatus,
  TradeMarket,
} from "@/lib/trade-analysis";

/** Shape of GET /api/v1/trades/auto (admin session) that this panel reads. */
export interface MarketSetupsView {
  ok?: boolean;
  status?: SetupStatus;
  reason?: string;
  setups?: HighProfitTradeSetup[];
  perInstrument?: Array<{ instrument: string; status: SetupStatus; reason: string }>;
  dataQuality?: SetupDataQuality;
  marketTiming?: MarketTimingInfo;
  error?: string;
  timestamp?: string;
}

const POLL_MS = 60_000;

/** Loads the setups derived by the server for one market (admin session cookie, read-only). */
export function useMarketSetups(market: TradeMarket) {
  const [data, setData] = useState<MarketSetupsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/trades/auto?market=${market}&autoExecute=false`, {
        credentials: "same-origin",
      });
      const json = (await res.json()) as MarketSetupsView;
      if (!res.ok && !json.status) {
        setError(json.error ?? `Request failed (${res.status})`);
        setData(null);
      } else {
        setData(json);
        setError(json.ok === false ? (json.error ?? null) : null);
      }
    } catch (e) {
      setError((e as Error)?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { data, loading, error, refresh: load };
}
