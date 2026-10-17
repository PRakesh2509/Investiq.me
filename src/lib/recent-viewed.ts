import { useEffect, useState } from "react";

const KEY = "investiq_recent_viewed_v1";
const MAX = 5;

export function pushRecentViewed(symbol: string) {
  if (typeof window === "undefined" || !symbol) return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [symbol, ...list.filter((s) => s !== symbol)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("investiq:recent-viewed", { detail: next }));
  } catch {
    // ignore
  }
}

export function useRecentViewed(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setList(JSON.parse(raw));
    } catch {
      // ignore
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) setList(detail);
    };
    window.addEventListener("investiq:recent-viewed", handler);
    return () => window.removeEventListener("investiq:recent-viewed", handler);
  }, []);
  return list;
}
