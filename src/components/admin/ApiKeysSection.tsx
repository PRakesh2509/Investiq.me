import { RotateCcw } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { ApiKeyCard } from "./ApiKeyCard";
import { HighProfitTradesPanel } from "./HighProfitTradesPanel";
import { ResponseConsole } from "./ResponseConsole";
import { TradeExecutionGuide } from "./TradeExecutionGuide";
import { useApiKeyTester } from "./useApiKeyTester";
import { useKeyActions } from "./useKeyActions";

export function ApiKeysSection() {
  const { keyStatus } = useAdmin();
  const { fresh, busy, rotate, revoke, dismiss } = useKeyActions();
  const { testingEndpoint, testResult, setTestResult, runLiveTest } = useApiKeyTester();

  const activeCount = [keyStatus.nse, keyStatus.global].filter((k) => k.configured).length;

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">API Key Management</h3>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {activeCount} Active Dedicated {activeCount === 1 ? "Key" : "Keys"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Dedicated REST API keys for external paper trading webpages. Use the{" "}
            <strong>1st Key</strong> to stream NSE F&amp;O signals &amp; option chain data, and the{" "}
            <strong>2nd Key</strong> for Global index feeds and trade order execution. Keys are
            generated in your browser and only their SHA-256 hash is stored — a new key is shown
            once.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rotate("nse")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Rotate NSE Key
          </button>
          <button
            onClick={() => rotate("global")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Rotate Global Key
          </button>
        </div>
      </div>

      {/* SECTION 1: 1st Dedicated Key - NSE F&O */}
      <ApiKeyCard
        scope="nse"
        title="NSE F&O Signals & Trading Engine Key"
        description={
          <>
            Dedicated REST authorization key for Indian market F&amp;O indices:{" "}
            <strong className="text-foreground">
              NIFTY 50 • BANK NIFTY • FIN NIFTY • SENSEX • MIDCAP NIFTY
            </strong>
            . Streams live entry/exit signals, confluence scores, target/stop-loss levels, and full
            option strike chain Greeks.
          </>
        }
        scopes="read:signals, read:option_chain, write:paper_orders"
        curlPath="/api/v1/fno/signals?instrument=NIFTY%2050"
        info={keyStatus.nse}
        freshKey={fresh.nse}
        busy={busy === "nse"}
        testing={testingEndpoint === "NSE_FNO"}
        onTest={() => runLiveTest("NSE_FNO")}
        onRotate={() => rotate("nse")}
        onRevoke={() => revoke("nse")}
        onDismissFresh={() => dismiss("nse")}
      />

      {/* SECTION 2: 2nd Dedicated Key - GLOBAL */}
      <ApiKeyCard
        scope="global"
        title="Global Indices & Cross-Market API Key"
        description={
          <>
            Dedicated REST authorization key for Global World Indices:{" "}
            <strong className="text-foreground">S&amp;P 500 • NASDAQ 100 • DOW JONES</strong>.
            Streams international trend signals, regime indicators, breakout confirmation, and
            global correlations.
          </>
        }
        scopes="read:global_signals, write:paper_orders"
        curlPath="/api/v1/global/signals?instrument=S%26P%20500"
        info={keyStatus.global}
        freshKey={fresh.global}
        busy={busy === "global"}
        testing={testingEndpoint === "GLOBAL"}
        onTest={() => runLiveTest("GLOBAL")}
        onRotate={() => rotate("global")}
        onRevoke={() => revoke("global")}
        onDismissFresh={() => dismiss("global")}
      />

      <HighProfitTradesPanel testingEndpoint={testingEndpoint} onRun={runLiveTest} />

      {/* SECTION 3: External Paper Trading Webpage Trade Execution */}
      <TradeExecutionGuide testingEndpoint={testingEndpoint} onRun={runLiveTest} />

      {/* SECTION 4: Live Interactive Response Console */}
      <ResponseConsole
        testResult={testResult}
        onClear={() => setTestResult(null)}
        onRun={runLiveTest}
      />
    </div>
  );
}
