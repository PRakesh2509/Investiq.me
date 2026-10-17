import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * Premium loading animation — animated candlestick + progress chips +
 * rotating typing text. Use inline or full-screen while data is fetching.
 */
export function PremiumLoader({
  label = "Deep analysis in progress",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const chips = [
    "Streaming Live Ticks",
    "Aggregating OHLC",
    "Computing EMA",
    "AI Deep Analysis",
  ];
  const lines = [
    "Rendering Chart • Reading Order Flow",
    "Validating Signals • Fetching Data",
    "Building Confidence Scores • Almost Ready",
  ];
  const [step, setStep] = useState(0);
  const [line, setLine] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => (s < chips.length ? s + 1 : s)), 400);
    return () => window.clearInterval(t);
  }, [chips.length]);
  useEffect(() => {
    const t = window.setInterval(() => setLine((l) => (l + 1) % lines.length), 1500);
    return () => window.clearInterval(t);
  }, [lines.length]);

  // 9 candles, alternating bullish/bearish, staggered pop-in
  const candles = Array.from({ length: 9 }, (_, i) => ({
    x: 6 + i * 11,
    // random-looking but deterministic body
    high: 8 + ((i * 7) % 18),
    low: 44 - ((i * 5) % 20),
    open: 20 + ((i * 3) % 18),
    close: 28 + ((i * 11) % 16),
    bull: i % 2 === 0,
    delay: i * 100,
  }));

  return (
    <div
      className={`glass-card iq-fade-in mx-auto flex flex-col items-center gap-5 p-8 ${
        compact ? "max-w-sm" : "max-w-md"
      }`}
    >
      <div className="relative w-full">
        <span className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" style={{ animation: "iq-pulse-dot 1s ease-in-out infinite" }} />
          Building
        </span>
        <svg width="100%" height="70" viewBox="0 0 110 60" className="mt-4">
          {/* faint grid */}
          {[10, 25, 40, 55].map((y) => (
            <line key={y} x1="0" y1={y} x2="110" y2={y} stroke="oklch(0.75 0.13 82 / 15%)" strokeWidth="0.5" />
          ))}
          {candles.map((c, i) => {
            const color = c.bull ? "#10B981" : "#EF4444";
            const y = Math.min(c.open, c.close);
            const h = Math.max(2, Math.abs(c.close - c.open));
            return (
              <g
                key={i}
                style={{
                  transformOrigin: `${c.x + 3}px 30px`,
                  animation: `iq-candle-pop 320ms ease ${c.delay}ms both`,
                }}
              >
                <line x1={c.x + 3} y1={c.high} x2={c.x + 3} y2={c.low} stroke={color} strokeWidth="1" />
                <rect x={c.x} y={y} width="6" height={h} fill={color} rx="1" />
              </g>
            );
          })}
          {/* EMA curve */}
          <path
            d="M 6 34 Q 25 22, 45 28 T 90 20 T 108 24"
            fill="none"
            stroke="#F5B62E"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="240"
            style={{ animation: "iq-ema-draw 1400ms ease 400ms both", filter: "drop-shadow(0 0 4px #F5B62E)" }}
          />
        </svg>
      </div>

      <div className="flex w-full flex-wrap justify-center gap-2">
        {chips.map((c, i) => {
          const active = i < step;
          return (
            <span
              key={c}
              className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[11px] font-semibold transition-all duration-300 ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-glow"
                  : "border-border bg-surface/50 text-muted-foreground"
              }`}
            >
              {active && <Check className="h-3 w-3" />}
              {c}
            </span>
          );
        })}
      </div>

      <p className="min-h-[1.25rem] text-center text-xs text-muted-foreground">
        <span className="text-primary">▸</span> {lines[line]}
        <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] bg-primary" style={{ animation: "iq-pulse-dot 0.8s ease-in-out infinite" }} />
      </p>
      <p className="-mt-2 text-center text-[11px] uppercase tracking-widest text-primary/80">{label}</p>
    </div>
  );
}
