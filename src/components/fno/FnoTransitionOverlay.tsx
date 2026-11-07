import { useEffect, useState, useMemo } from "react";
import { CandlestickChart, Activity, Zap, CheckCircle2 } from "lucide-react";

interface FnoTransitionOverlayProps {
  onComplete: () => void;
  niftyLtp?: number;
  bankNiftyLtp?: number;
}

export function FnoTransitionOverlay({
  onComplete,
  niftyLtp = 24650.4,
  bankNiftyLtp = 52410.2,
}: FnoTransitionOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [preloaded, setPreloaded] = useState(false);

  // Check user preference for reduced motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Preload option chain and signals in background
  useEffect(() => {
    const preload = async () => {
      try {
        await Promise.allSettled([
          fetch("/api/live-feed?symbol=NIFTY%2050"),
          fetch("/api/live-feed?symbol=BANK%20NIFTY"),
        ]);
        setPreloaded(true);
      } catch {
        setPreloaded(true);
      }
    };
    preload();
  }, []);

  // 5000ms exact timer with smooth progress updates
  useEffect(() => {
    const startTime = Date.now();
    const duration = 5000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(pct);

      if (elapsed >= 1000 && elapsed < 2000) setActiveStep(1);
      else if (elapsed >= 2000 && elapsed < 3500) setActiveStep(2);
      else if (elapsed >= 3500 && elapsed < 4600) setActiveStep(3);
      else if (elapsed >= 4600) setActiveStep(4);

      if (elapsed >= duration) {
        clearInterval(interval);
        onComplete();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete]);

  // Demo strike grid for the animated matrix
  const strikes = [
    { strike: 24500, ce: 185.4, pe: 64.2, oiCe: "1.42L", oiPe: "84K" },
    { strike: 24550, ce: 148.2, pe: 88.5, oiCe: "2.10L", oiPe: "1.15L" },
    { strike: 24600, ce: 112.6, pe: 118.0, oiCe: "3.85L", oiPe: "2.90L", isAtm: true },
    { strike: 24650, ce: 82.5, pe: 154.2, oiCe: "4.20L", oiPe: "1.65L" },
    { strike: 24700, ce: 58.0, pe: 198.8, oiCe: "2.80L", oiPe: "95K" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Entering F&O Live Institutional Terminal"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070B0E]/95 backdrop-blur-xl text-foreground font-mono transition-opacity duration-500"
    >
      <div className="relative w-full max-w-2xl px-6 py-8 mx-auto flex flex-col items-center text-center">
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Ticker */}
        <div className="flex items-center gap-4 mb-6 rounded-full border border-border/80 bg-surface/80 px-4 py-1.5 text-xs shadow-glow">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-foreground">NIFTY 50:</span>
            <span className="text-emerald-400 font-bold">₹{niftyLtp.toFixed(2)}</span>
          </div>
          <span className="text-muted-foreground">|</span>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-bold text-foreground">BANK NIFTY:</span>
            <span className="text-primary font-bold">₹{bankNiftyLtp.toFixed(2)}</span>
          </div>
        </div>

        {/* Brand & Animation Icon */}
        <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-2xl border border-primary/40 bg-primary/10 shadow-glow text-primary">
          <CandlestickChart className="h-8 w-8 animate-pulse stroke-[2.5]" />
        </div>

        <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          F&amp;O LIVE <span className="text-primary">INSTITUTIONAL TERMINAL</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground tracking-wide">
          Direct Authorized DhanHQ Live Marketfeed &amp; Confluence Signals
        </p>

        {/* Interactive F&O Visual Elements (Calmer fade for reduced motion) */}
        {!prefersReducedMotion ? (
          <div className="w-full mt-6 space-y-4">
            {/* Animated Candlestick Strip */}
            <div className="h-16 w-full rounded-xl border border-border/60 bg-[#0B1015] p-2 flex items-center justify-around overflow-hidden shadow-inner">
              {[
                { h: "60%", type: "green" },
                { h: "80%", type: "green" },
                { h: "45%", type: "red" },
                { h: "90%", type: "green" },
                { h: "70%", type: "green" },
                { h: "40%", type: "red" },
                { h: "85%", type: "green" },
                { h: "95%", type: "green" },
              ].map((c, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center justify-center transition-all duration-700"
                  style={{
                    opacity: progress > i * 10 ? 1 : 0.2,
                    transform: progress > i * 10 ? "scale(1)" : "scale(0.8)",
                  }}
                >
                  <div
                    className={`w-0.5 h-3 ${c.type === "green" ? "bg-emerald-400" : "bg-rose-400"}`}
                  />
                  <div
                    className={`w-3 rounded-sm ${c.type === "green" ? "bg-emerald-500" : "bg-rose-500"}`}
                    style={{ height: c.h }}
                  />
                  <div
                    className={`w-0.5 h-3 ${c.type === "green" ? "bg-emerald-400" : "bg-rose-400"}`}
                  />
                </div>
              ))}
            </div>

            {/* Simulated Live Option Chain Grid Row-by-Row Building */}
            <div className="w-full rounded-xl border border-border/60 bg-[#0B1015]/90 p-3 shadow-sm text-[11px]">
              <div className="grid grid-cols-5 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1 mb-1 font-bold">
                <span className="text-left text-emerald-400">CALL OI</span>
                <span className="text-left text-emerald-400">CALL LTP</span>
                <span className="text-center text-foreground">STRIKE</span>
                <span className="text-right text-rose-400">PUT LTP</span>
                <span className="text-right text-rose-400">PUT OI</span>
              </div>
              <div className="space-y-1">
                {strikes.map((s, idx) => {
                  const visible = progress >= (idx + 1) * 16;
                  return (
                    <div
                      key={s.strike}
                      className={`grid grid-cols-5 items-center py-1 px-1 rounded transition-all duration-300 ${
                        s.isAtm ? "bg-primary/10 border border-primary/30" : "hover:bg-surface/50"
                      } ${visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}
                    >
                      <span className="text-left text-muted-foreground">{s.oiCe}</span>
                      <span className="text-left font-bold text-emerald-400">₹{s.ce.toFixed(1)}</span>
                      <span className="text-center font-bold text-foreground">
                        {s.strike} {s.isAtm ? "(ATM)" : ""}
                      </span>
                      <span className="text-right font-bold text-rose-400">₹{s.pe.toFixed(1)}</span>
                      <span className="text-right text-muted-foreground">{s.oiPe}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full mt-8 p-6 rounded-xl border border-border/60 bg-[#0B1015] text-center">
            <p className="text-sm font-semibold text-primary">Preloading Live F&amp;O Feeds…</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Initializing option Greeks, Greeks analysis, and technical confluences.
            </p>
          </div>
        )}

        {/* Status text & Progress Bar */}
        <div className="w-full mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
              {activeStep === 0 && "Connecting to DhanHQ v2 live socket…"}
              {activeStep === 1 && "Building real-time option chain matrix…"}
              {activeStep === 2 && "Computing multi-timeframe CPR & Supertrend…"}
              {activeStep === 3 && "Filtering A+ confluence sniper setups…"}
              {activeStep === 4 && "Finalizing institutional workstation view…"}
            </span>
            <span className="font-bold text-primary">{progress}%</span>
          </div>

          {/* Progress track */}
          <div className="w-full h-1.5 rounded-full bg-surface border border-border overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-emerald-400 to-primary rounded-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {preloaded && (
          <div className="mt-3 inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
            <CheckCircle2 className="h-3 w-3" />
            <span>Feeds &amp; Option Chain Preloaded</span>
          </div>
        )}
      </div>
    </div>
  );
}

