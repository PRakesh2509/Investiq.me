import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertCircle, ArrowRight, Play, Radio, RefreshCw, Server } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { DEFAULT_LOVABLE_ENDPOINT } from "./admin-constants";
import { appUrl } from "@/lib/app-url";
import { getActiveMarketByTiming } from "@/lib/trade-analysis";
import { useMarketSetups } from "./useMarketSetups";

type MarketMode = "AUTO" | "NSE_FNO" | "GLOBAL_US" | "BOTH";

interface DispatchRecord {
  id: string;
  timestamp: string;
  targetUrl?: string;
  market?: string;
  contract?: string;
  keyUsedMasked?: string;
  httpStatus?: number;
  statusText?: string;
  responseSnippet?: string;
  success?: boolean;
  notes?: string;
}

interface DispatchResult {
  dispatched?: boolean;
  error?: string;
  setupStatus?: string;
  setupReason?: string;
  logId?: string;
  market?: string;
  dispatchedContract?: string;
  keyUsed?: string;
  httpStatus?: number;
  statusText?: string;
  responseSnippet?: string;
  ok?: boolean;
  notes?: string;
}

const DISPATCH_LOG_URL = "/api/v1/trades/dispatch-external?limit=15";

function randomSuffix(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const PULL_SNIPPET_ONCE = `// In your paper trading app:
const IQ_API_KEY = "<your InvestIQ API key>";

export async function autoTakeInvestIQTrade() {
  const res = await fetch("${appUrl("/api/v1/trades/auto")}", {
    headers: { "x-api-key": IQ_API_KEY }
  });
  const data = await res.json();
  if (data.ok && data.autoOrder) {
    console.log("Auto-Filled Trade:", data.autoOrder.contract, "@", data.autoOrder.fillPrice);
    return data.autoOrder;
  }
}`;

const PULL_SNIPPET_POLL = `// Paper trading integration snippet
const IQ_API_KEY = "<your InvestIQ API key>";

setInterval(async () => {
  const res = await fetch("${appUrl("/api/v1/trades/auto")}", {
    headers: { "x-api-key": IQ_API_KEY }
  });
  const data = await res.json();
  if (data.ok && data.autoOrder) {
    // Automatically executes in your paper trading state:
    window.dispatchEvent(new CustomEvent("investiq-auto-order", { detail: data.autoOrder }));
  }
}, 30000);`;

export function AutoPushPanel() {
  const { settings, updateSettings } = useAdmin();

  const externalUrl = settings.externalTradingEndpoint || DEFAULT_LOVABLE_ENDPOINT;
  const autoPushEnabled = settings.autoPushTradesEnabled;
  const autoPushInterval = settings.autoPushIntervalSeconds || 30;

  const [urlInput, setUrlInput] = useState(externalUrl);
  const [dispatchMarketMode, setDispatchMarketMode] = useState<MarketMode>("AUTO");
  const [countdown, setCountdown] = useState(autoPushInterval);
  const [isPushingNow, setIsPushingNow] = useState(false);
  const [recentDispatches, setRecentDispatches] = useState<DispatchRecord[]>([]);
  const pushingRef = useRef(false);

  const activeTiming = getActiveMarketByTiming();
  const { data: activeSetups } = useMarketSetups(activeTiming.activeMarket);
  const activeSetup = activeSetups?.setups?.[0];

  // Keep the edit buffer in sync when persisted settings hydrate / change.
  useEffect(() => {
    setUrlInput(externalUrl);
  }, [externalUrl]);

  const loadDispatches = useCallback(async (notify: boolean) => {
    try {
      const r = await fetch(DISPATCH_LOG_URL, { credentials: "same-origin" });
      const data = await r.json();
      if (data.ok && Array.isArray(data.recentDispatches)) {
        setRecentDispatches(data.recentDispatches);
        if (notify) toast.success("Dispatch log refreshed");
      }
    } catch {
      if (notify) toast.error("Could not refresh dispatch log");
    }
  }, []);

  useEffect(() => {
    void loadDispatches(false);
  }, [loadDispatches]);

  const triggerExternalPush = useCallback(
    async (isBackground = false) => {
      if (pushingRef.current) return;
      pushingRef.current = true;
      setIsPushingNow(true);
      try {
        const marketsToPush: Array<"AUTO" | "NSE_FNO" | "GLOBAL_US"> =
          dispatchMarketMode === "BOTH" ? ["NSE_FNO", "GLOBAL_US"] : [dispatchMarketMode];

        for (const m of marketsToPush) {
          const res = await fetch("/api/v1/trades/dispatch-external", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUrl: externalUrl, market: m }),
          });
          const json = await res.json();
          const resData: DispatchResult = json.result || json;
          if (resData?.dispatched === false) {
            // Nothing was sent: no valid setup (or configuration problem). Log nothing as a dispatch.
            if (!isBackground) {
              toast.info(
                `Not dispatched (${m}): ${json.reason ?? resData.setupReason ?? resData.error ?? json.error ?? "no valid setup"}`,
              );
            }
            continue;
          }
          if (resData) {
            setRecentDispatches((prev) => [
              {
                id: resData.logId || `disp_${Date.now()}_${randomSuffix()}`,
                timestamp: new Date().toISOString(),
                targetUrl: externalUrl,
                market: resData.market,
                contract: resData.dispatchedContract,
                keyUsedMasked: resData.keyUsed,
                httpStatus: resData.httpStatus,
                statusText: resData.statusText,
                responseSnippet: resData.responseSnippet,
                success: resData.ok,
                notes: resData.notes,
              },
              ...prev.slice(0, 24),
            ]);
          }
          if (!isBackground) {
            if (json.ok) {
              toast.success(
                `Dispatched ${resData?.dispatchedContract} (${resData?.market}) to paper trading endpoint!`,
              );
            } else {
              toast.info(
                `Sent ${resData?.dispatchedContract} to endpoint (${resData?.httpStatus || resData?.statusText})`,
              );
            }
          }
        }
      } catch (e) {
        if (!isBackground) toast.error(`Auto-push failed: ${(e as Error)?.message}`);
      } finally {
        pushingRef.current = false;
        setIsPushingNow(false);
      }
    },
    [externalUrl, dispatchMarketMode],
  );

  // The interval always calls the latest push handler without re-creating the timer.
  const pushRef = useRef(triggerExternalPush);
  useEffect(() => {
    pushRef.current = triggerExternalPush;
  }, [triggerExternalPush]);

  // Periodic auto-push countdown; the server dispatches strictly according to market timings.
  useEffect(() => {
    if (!autoPushEnabled) return;
    let remaining = autoPushInterval;
    setCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = autoPushInterval;
        void pushRef.current(true);
      }
      setCountdown(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [autoPushEnabled, autoPushInterval]);

  const handleSaveEndpoint = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error("Please enter a valid webhook URL");
      return;
    }
    updateSettings({ externalTradingEndpoint: trimmed });
    toast.success("Updated external trading endpoint");
  };

  const handleResetToLovable = () => {
    setUrlInput(DEFAULT_LOVABLE_ENDPOINT);
    updateSettings({ externalTradingEndpoint: DEFAULT_LOVABLE_ENDPOINT });
    toast.info("Reset to Lovable default endpoint");
  };

  return (
    <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-surface/90 via-surface/70 to-cyan-950/20 p-6 shadow-2xl backdrop-blur relative overflow-hidden space-y-5">
      <div className="absolute top-0 right-0 h-48 w-48 bg-cyan-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/50 bg-cyan-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300 shadow-sm">
              <Radio className="h-3.5 w-3.5 text-cyan-400 animate-pulse" /> Auto-Webhook Engine •
              Lovable Paper Trading
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {autoPushEnabled ? `Live Auto-Push (Next: ${countdown}s)` : "Paused"}
            </span>
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">
            Automatic Outbound Trades to Lovable Paper Trading
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            InvestIQ automatically pushes analyzed high-profit trades directly to your designated
            Lovable paper trading endpoint using our authorized API keys, but only when a setup can
            be derived from live data (nothing is sent otherwise). Automatically routes between{" "}
            <strong className="text-foreground">NSE F&amp;O</strong> (09:15–15:30 IST, non-holiday
            weekdays) and the <strong className="text-foreground">US Session</strong> (New York
            09:30–16:00; 19:00–01:30 IST during US daylight time) without requiring manual clicks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => triggerExternalPush(false)}
            disabled={isPushingNow}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/50 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition shadow-md disabled:opacity-50"
          >
            {isPushingNow ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            {isPushingNow ? "Pushing Trade…" : "Auto-Push Live Trade Now"}
          </button>
        </div>
      </div>

      {/* Config Bar: Target Endpoint */}
      <div className="rounded-xl border border-border/80 bg-background/80 p-4 shadow-inner space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-cyan-400" /> Active Destination Webhook URL
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Interval:</span>
            <select
              value={autoPushInterval}
              onChange={(e) => {
                const sec = parseInt(e.target.value, 10);
                setCountdown(sec);
                updateSettings({ autoPushIntervalSeconds: sec });
              }}
              className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-foreground font-medium"
            >
              <option value={15}>Every 15s</option>
              <option value={30}>Every 30s</option>
              <option value={60}>Every 60s</option>
            </select>

            <button
              type="button"
              onClick={() => {
                const next = !autoPushEnabled;
                updateSettings({ autoPushTradesEnabled: next });
                toast.info(next ? "Automatic trade push enabled" : "Automatic trade push paused");
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                autoPushEnabled
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-surface text-muted-foreground border border-border"
              }`}
            >
              {autoPushEnabled ? "Auto-Push: ON" : "Auto-Push: OFF"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://your-paper-trading-app.example/api/public/investiq/trades"
            className="flex-1 min-w-[280px] rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveEndpoint}
            className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shrink-0"
          >
            Save Destination
          </button>
          <button
            type="button"
            onClick={handleResetToLovable}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition shrink-0"
            title="Reset to default Lovable project endpoint"
          >
            Reset Default
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground border-t border-border/50 pt-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
              Market Timing Mode:
            </span>
            <select
              value={dispatchMarketMode}
              onChange={(e) => setDispatchMarketMode(e.target.value as MarketMode)}
              className="rounded-md border border-cyan-500/40 bg-surface px-2.5 py-1 text-xs text-cyan-300 font-semibold"
            >
              <option value="AUTO">AUTO: Follow Live Market Timings (holiday-aware)</option>
              <option value="NSE_FNO">NSE F&amp;O Only (Indian Hours: 09:15 - 15:30 IST)</option>
              <option value="GLOBAL_US">
                US &amp; Global Only ({activeTiming.globalTiming.regularHoursIST})
              </option>
              <option value="BOTH">Push Both (Indian &amp; US Simultaneously)</option>
            </select>
          </div>
          <span className="text-cyan-400 font-medium">Auto-dispatch timer active</span>
        </div>

        {/* Live Market Session Timing Diagnostic Card */}
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-cyan-200 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              {activeTiming.marketReason}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              Current Time:{" "}
              <strong className="text-foreground">
                {activeTiming.globalTiming.currentISTTime}
              </strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Active Trade:{" "}
              {activeSetup ? (
                <strong className="text-foreground">
                  {activeSetup.contract} (Target 2: {activeSetup.currency}
                  {activeSetup.target2}, {activeSetup.expectedProfitPctT2} if hit)
                </strong>
              ) : (
                <strong className="text-amber-400" title={activeSetups?.reason}>
                  None: {activeSetups?.status ?? "loading…"}
                </strong>
              )}
            </span>
            <span>
              Key Used:{" "}
              <code className="text-cyan-300 font-mono">
                {activeTiming.activeMarket === "GLOBAL_US"
                  ? "2nd KEY (GLOBAL)"
                  : "1st KEY (NSE F&O)"}
              </code>
            </span>
            <span>
              Session Status:{" "}
              <strong
                className={activeTiming.isLiveSession ? "text-emerald-400" : "text-amber-400"}
              >
                {activeTiming.isLiveSession ? "Live Trading Session" : "Queued for Open"}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Recent Dispatches Live Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" /> Live Dispatch Activity Log (Last{" "}
            {recentDispatches.length})
          </span>
          <button
            type="button"
            onClick={() => void loadDispatches(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Refresh Logs
          </button>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/50 overflow-hidden shadow-inner">
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface/80 text-[11px] uppercase tracking-wider text-muted-foreground sticky top-0 border-b border-border/60">
                <tr>
                  <th className="px-3.5 py-2 font-medium">Timestamp</th>
                  <th className="px-3.5 py-2 font-medium">Market</th>
                  <th className="px-3.5 py-2 font-medium">Contract Dispatched</th>
                  <th className="px-3.5 py-2 font-medium">API Key Used</th>
                  <th className="px-3.5 py-2 font-medium">HTTP Status</th>
                  <th className="px-3.5 py-2 font-medium">Response Snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                {recentDispatches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3.5 py-4 text-center font-sans text-muted-foreground"
                    >
                      No dispatches recorded yet. Timer will push automatically in {countdown}s or
                      click "Auto-Push Live Trade Now".
                    </td>
                  </tr>
                ) : (
                  recentDispatches.map((d) => (
                    <tr key={d.id} className="hover:bg-surface/40 transition">
                      <td className="px-3.5 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(d.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-3.5 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            d.market === "GLOBAL_US"
                              ? "bg-cyan-500/15 text-cyan-300"
                              : "bg-emerald-500/15 text-emerald-300"
                          }`}
                        >
                          {d.market}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 font-bold text-foreground">{d.contract}</td>
                      <td className="px-3.5 py-2 text-muted-foreground">{d.keyUsedMasked}</td>
                      <td className="px-3.5 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            d.httpStatus && d.httpStatus >= 200 && d.httpStatus < 300
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : d.httpStatus === 401
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}
                        >
                          {d.httpStatus ? `${d.httpStatus} ${d.statusText}` : d.statusText}
                        </span>
                      </td>
                      <td
                        className="px-3.5 py-2 text-muted-foreground max-w-xs truncate"
                        title={d.responseSnippet}
                      >
                        {d.responseSnippet || (d.notes ? d.notes : "Sent")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Direct Pull Integration */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs text-amber-200">
        <div className="flex items-center gap-2 font-bold text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>Webhook Push vs Direct Pull Integration</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Outbound webhooks to a private or preview-protected destination (for example a sandbox
          that requires a logged-in session) may return{" "}
          <strong className="text-amber-300">401 Unauthorized</strong>. In that case let your paper
          trading app pull trades from InvestIQ directly instead.
        </p>
        <div className="rounded-lg border border-amber-500/20 bg-background/50 p-3 space-y-1">
          <strong className="text-foreground flex items-center gap-1.5">
            <ArrowRight className="h-3.5 w-3.5 text-emerald-400" /> Direct Pull (CORS Ready)
          </strong>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Fetch trades from InvestIQ directly using the snippet below. InvestIQ has CORS enabled (
            <code className="text-emerald-300">*</code>) so it works from any browser webpage
            without firewall issues.
          </p>
        </div>

        {/* Pull snippet code box */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono pb-1">
            <span>Direct code to paste in your app (Auto-trades polling):</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(PULL_SNIPPET_ONCE).then(
                  () => toast.success("Snippet copied to clipboard"),
                  () => toast.error("Could not copy snippet"),
                );
              }}
              className="text-cyan-300 hover:text-cyan-200 underline font-sans"
            >
              Copy Snippet
            </button>
          </div>
          <pre className="rounded-lg border border-border/80 bg-background/90 p-2.5 font-mono text-[11px] text-cyan-300 overflow-x-auto select-all">
            {PULL_SNIPPET_POLL}
          </pre>
        </div>
      </div>
    </div>
  );
}
