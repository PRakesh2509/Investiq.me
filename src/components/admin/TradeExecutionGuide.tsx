import { Play, RefreshCw, Terminal } from "lucide-react";
import { appUrl } from "@/lib/app-url";
import type { LiveActionType } from "./useApiKeyTester";

const ORDER_EXAMPLE = `// Take a paper trade from your external webpage
const IQ_API_KEY = "<your InvestIQ API key>"; // NSE F&O key or Global key

// 1. Ask for the current derived setup (setups is [] with a reason when there is none)
const setupRes = await fetch("${appUrl("/api/v1/trades/auto?autoExecute=false")}", {
  headers: { "x-api-key": IQ_API_KEY }
});
const { setups, status, reason } = await setupRes.json();
if (!setups.length) throw new Error("No trade: " + status + " - " + reason);
const setup = setups[0];

// 2. Place the paper order for that setup (MARKET fills at the setup's entry premium)
const response = await fetch("${appUrl("/api/v1/trades/order")}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": IQ_API_KEY
  },
  body: JSON.stringify({
    symbol: setup.symbol,
    contract: setup.contract,
    action: "BUY",
    lots: 2
  })
});
const order = await response.json();
console.log("Paper trade executed:", order);`;

/** External paper-trading trade-execution guide with a simulate button. */
export function TradeExecutionGuide({
  testingEndpoint,
  onRun,
}: {
  testingEndpoint: LiveActionType | null;
  onRun: (type: LiveActionType) => void;
}) {
  return (
    <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-surface/80 via-surface/60 to-purple-950/10 p-6 shadow-xl backdrop-blur relative overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-purple-300">
              <Terminal className="h-3.5 w-3.5" /> Paper Trading Trade Execution
            </span>
            <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-xs font-mono text-purple-300">
              POST /api/v1/trades/order
            </span>
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">
            How to Take Trades on Your Paper Trading Webpage
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Use your <strong>NSE F&amp;O Key</strong> or <strong>GLOBAL Key</strong> to take paper
            trades from your external application. Orders are simulated paper fills (no broker order
            is ever sent) with an order ID, fill price and status. MARKET orders fill at the current
            derived setup's entry premium, or are refused with a reason when no valid setup exists
            (a LIMIT order, or a MARKET order with an explicit price, is a manual paper order). Full
            CORS support allows direct{" "}
            <code className="rounded bg-background/80 px-1 font-mono text-[11px]">fetch()</code>{" "}
            calls from browser webpages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRun("TRADE_ORDER")}
          disabled={testingEndpoint === "TRADE_ORDER"}
          className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition disabled:opacity-50"
        >
          {testingEndpoint === "TRADE_ORDER" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          Simulate Sample Paper Order
        </button>
      </div>

      {/* Code Example */}
      <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4 text-xs font-mono space-y-2">
        <div className="text-[11px] font-sans font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>JavaScript fetch example (Copy to your paper trading webpage):</span>
          <span className="text-purple-400">CORS Allowed (*)</span>
        </div>
        <pre className="overflow-x-auto text-muted-foreground leading-relaxed p-2 bg-background/90 rounded-lg select-all">
          {ORDER_EXAMPLE}
        </pre>
      </div>
    </div>
  );
}
