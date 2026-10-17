import { useEffect, useRef } from "react";

/**
 * Generic TradingView embed. Injects the official widget script into a scoped
 * container so multiple widgets can live on the same page without clashing.
 */
export default function TVWidget({
  script,
  config,
  height = 420,
  className = "",
}: {
  script: string;
  config: Record<string, unknown>;
  height?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    el.appendChild(inner);
    const s = document.createElement("script");
    s.src = `https://s3.tradingview.com/external-embedding/${script}`;
    s.type = "text/javascript";
    s.async = true;
    s.innerHTML = JSON.stringify(config);
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, [script, JSON.stringify(config)]);

  return (
    <div
      ref={host}
      className={`tradingview-widget-container overflow-hidden rounded-xl border border-border bg-background/40 ${className}`}
      style={{ height }}
    />
  );
}
