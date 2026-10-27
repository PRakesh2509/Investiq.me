import { RefreshCw, Zap } from "lucide-react";
import { AutoPushPanel } from "./AutoPushPanel";
import { GlobalTradeSetups, IndianTradeSetups } from "./TradeSetups";
import type { LiveActionType } from "./useApiKeyTester";

/** High-Profit Analyzed Trades (dispatched by market timings) + auto-webhook engine. */
export function HighProfitTradesPanel({
  testingEndpoint,
  onRun,
}: {
  testingEndpoint: LiveActionType | null;
  onRun: (type: LiveActionType) => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-surface/90 via-surface/70 to-primary/5 p-6 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <Zap className="h-3.5 w-3.5" /> High-Profit Analyzed Trades Engine
            </span>
            <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Real Candles • Live Option Chain • Macro Quotes
            </span>
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">
            Analyzed High-Profit Trades (Indian &amp; US Markets)
          </h3>
          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
            Setups are <strong>derived from live data</strong>: real 5-minute candles (EMA, VWAP,
            RSI, Supertrend, swing support/resistance, ATR), the provider{" "}
            <strong>option chain</strong> (bid/ask premiums, Delta, Gamma, Theta, PCR, Max Pain) and
            market-wide macro quotes. Entry, stop and targets are computed from real premiums and
            ATR. When data is unavailable, simulated, stale, or the session is closed, no setup is
            shown and the reason is displayed instead. All orders are paper orders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onRun("AUTO_TRADE_NSE")}
            disabled={testingEndpoint === "AUTO_TRADE_NSE"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition shadow-sm"
            title="Fetch the current derived Indian setup (or the reason there is none)"
          >
            <Zap className="h-3.5 w-3.5 text-emerald-400" /> Auto-Trade NSE (Hands-Free)
          </button>
          <button
            type="button"
            onClick={() => onRun("AUTO_TRADE_GLOBAL")}
            disabled={testingEndpoint === "AUTO_TRADE_GLOBAL"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition shadow-sm"
            title="Fetch the current derived US setup (or the reason there is none)"
          >
            <Zap className="h-3.5 w-3.5 text-cyan-400" /> Auto-Trade US (Hands-Free)
          </button>
          <button
            type="button"
            onClick={() => onRun("FETCH_ALL_TRADES")}
            disabled={testingEndpoint === "FETCH_ALL_TRADES"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/80 px-3 py-2 text-xs font-medium hover:bg-accent transition"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${testingEndpoint === "FETCH_ALL_TRADES" ? "animate-spin" : ""}`}
            />
            Refresh All
          </button>
        </div>
      </div>

      {/* Automatic Hands-Free Notification Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span>
            <strong>Hands-free paper trading:</strong> your external paper trading webpage can call{" "}
            <code className="font-mono bg-background/80 px-1 py-0.5 rounded text-emerald-200">
              GET /api/v1/trades/auto
            </code>{" "}
            with your API key to receive the current derived setup (or a clear "no trade" reason).
          </span>
        </div>
        <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
          CORS: Allowed (*)
        </span>
      </div>

      <AutoPushPanel />

      <IndianTradeSetups testingEndpoint={testingEndpoint} onDispatch={onRun} />
      <GlobalTradeSetups testingEndpoint={testingEndpoint} onDispatch={onRun} />
    </div>
  );
}
