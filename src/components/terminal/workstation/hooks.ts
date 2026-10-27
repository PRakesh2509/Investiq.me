import { useEffect, useState } from "react";

/** Seconds elapsed since `ts` (ms epoch); ticks once per second. Null when `ts` is null. */
export function useSecondsSince(ts: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return ts == null ? null : Math.max(0, Math.floor((now - ts) / 1000));
}

/** Seconds remaining in the current candle for the given timeframe length. */
export function useCandleCountdown(totalSeconds: number): string {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const total = totalSeconds || 60;
  const rem = total - (nowSec % total);
  const mins = Math.floor(rem / 60);
  const secs = rem % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
