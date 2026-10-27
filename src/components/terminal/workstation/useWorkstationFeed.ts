import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTerminalBars,
  getTerminalMarketData,
  type WorkstationBar,
} from "@/lib/terminal-workstation.functions";
import {
  getFnoWorkstationIntelligence,
  type FnoIntelligenceData,
} from "@/lib/fno-intelligence.functions";
import type { DataQualityFlags } from "@/components/DataQualityBadges";
import { REFRESH_INTERVAL_MS, type TF } from "./constants";
import type { WorkstationData } from "./types";

/**
 * Loads live quote, candles and AI intelligence for the workstation from the server only.
 * No client-side price generation: when the server fails the previous server payload is
 * kept (flagged stale) or an explicit error is surfaced.
 */
export function useWorkstationFeed(instrument: string, tf: TF) {
  const fetchMarketData = useServerFn(getTerminalMarketData);
  const fetchBars = useServerFn(getTerminalBars);
  const fetchIntelligence = useServerFn(getFnoWorkstationIntelligence);

  const [data, setData] = useState<WorkstationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [intelligence, setIntelligence] = useState<FnoIntelligenceData | null>(null);

  const [bars, setBars] = useState<WorkstationBar[]>([]);
  const [barsFlags, setBarsFlags] = useState<DataQualityFlags | null>(null);
  const [barsLoading, setBarsLoading] = useState(true);
  const [barsError, setBarsError] = useState<string | null>(null);

  // Guards against late responses for a previously selected instrument.
  const activeInstrument = useRef(instrument);
  activeInstrument.current = instrument;

  const loadIntelligence = useCallback(
    async (
      inst: string,
      spot: number,
      changePct: number,
      dir: "CALL" | "PUT",
      forceRefresh?: boolean,
    ) => {
      try {
        const res = await fetchIntelligence({
          data: {
            instrument: inst,
            spotPrice: spot,
            changePct,
            intendedDirection: dir,
            forceRefresh,
          },
        });
        if (res && activeInstrument.current === inst) setIntelligence(res);
      } catch (e) {
        console.warn("Could not load F&O intelligence:", e);
      }
    },
    [fetchIntelligence],
  );

  const loadData = useCallback(
    async (inst: string, forceRefresh = false) => {
      setIsRefreshing(true);
      try {
        const res = await fetchMarketData({ data: { instrument: inst } });
        if (activeInstrument.current !== inst) return;
        if (res?.ok) {
          setData(res as WorkstationData);
          setError(null);
          setUpdatedAt(Date.now());
          // Reflect the latest server price on the open candle (server data only).
          setBars((prev) => {
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                high: Math.max(last.high, res.spotPrice),
                low: Math.min(last.low, res.spotPrice),
                close: res.spotPrice,
              },
            ];
          });
          void loadIntelligence(inst, res.spotPrice, res.changePct, res.direction, forceRefresh);
        } else {
          setError("Live market data is unavailable right now.");
        }
      } catch (e) {
        if (activeInstrument.current !== inst) return;
        setError(e instanceof Error && e.message ? e.message : "Failed to load live market data.");
      } finally {
        if (activeInstrument.current === inst) setIsRefreshing(false);
      }
    },
    [fetchMarketData, loadIntelligence],
  );

  // Candles: reload when instrument or timeframe changes.
  useEffect(() => {
    let alive = true;
    setBars([]);
    setBarsFlags(null);
    setBarsError(null);
    setBarsLoading(true);
    fetchBars({ data: { instrument, timeframe: tf } })
      .then((res) => {
        if (!alive) return;
        if (res?.ok && res.bars?.length) {
          setBars(res.bars);
          setBarsFlags(res as unknown as DataQualityFlags);
        } else {
          setBarsError("No chart data available for this instrument and timeframe.");
        }
      })
      .catch((e) => {
        if (alive)
          setBarsError(e instanceof Error && e.message ? e.message : "Chart data failed to load.");
      })
      .finally(() => {
        if (alive) setBarsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [instrument, tf, fetchBars]);

  // Quote + intelligence: load on instrument change and poll.
  useEffect(() => {
    setData(null);
    setError(null);
    setUpdatedAt(null);
    setIntelligence(null);
    void loadData(instrument);
    const id = setInterval(() => void loadData(instrument), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [instrument, loadData]);

  const refresh = useCallback(
    (force = false) => loadData(instrument, force),
    [instrument, loadData],
  );

  return {
    data,
    error,
    updatedAt,
    isRefreshing,
    intelligence,
    bars,
    barsFlags,
    barsLoading,
    barsError,
    refresh,
  };
}
