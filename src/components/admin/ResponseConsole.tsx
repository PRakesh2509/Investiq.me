import { Activity, Globe, Sparkles, Terminal } from "lucide-react";
import type { LiveActionType, TestResult } from "./useApiKeyTester";

/** Live interactive response console & inspector. */
export function ResponseConsole({
  testResult,
  onClear,
  onRun,
}: {
  testResult: TestResult | null;
  onClear: () => void;
  onRun: (type: LiveActionType) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 p-6 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-background/60 text-primary">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-display text-base font-semibold text-foreground">
              Live API Response Console &amp; Inspector
            </h4>
            <p className="text-xs text-muted-foreground">
              Immediate feedback confirming authorization and live data payloads (an empty setups
              list with a status and reason is a valid answer).
            </p>
          </div>
        </div>

        {testResult && (
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear Console
          </button>
        )}
      </div>

      {testResult ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  testResult.ok
                    ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                    : "border border-destructive/40 bg-destructive/15 text-destructive"
                }`}
              >
                {testResult.status} {testResult.ok ? "OK" : "ERROR"}
              </span>
              <span className="text-foreground">{testResult.endpoint}</span>
            </div>
            <span className="text-muted-foreground">
              Key used: <strong className="text-foreground">{testResult.keyUsed}</strong>
            </span>
          </div>

          <pre className="max-h-96 overflow-y-auto rounded-xl border border-border/80 bg-background/90 p-4 font-mono text-xs text-emerald-400/90 leading-relaxed shadow-inner">
            {JSON.stringify(testResult.data || testResult, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/30 p-8 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-2.5 text-sm font-medium text-foreground">Interactive Console Ready</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Click <strong>Test NSE Key</strong>, <strong>Test Global Key</strong>, or{" "}
            <strong>Simulate Sample Paper Order</strong> above to view live API responses and verify
            both keys work. The sample order carries a caller-supplied price; it is not a derived
            setup.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={() => onRun("NSE_FNO")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
            >
              <Activity className="h-3.5 w-3.5" /> Test NSE F&amp;O Key
            </button>
            <button
              type="button"
              onClick={() => onRun("GLOBAL")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition"
            >
              <Globe className="h-3.5 w-3.5" /> Test Global Key
            </button>
            <button
              type="button"
              onClick={() => onRun("TRADE_ORDER")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition"
            >
              <Terminal className="h-3.5 w-3.5" /> Simulate Sample Paper Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
