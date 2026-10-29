import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Check,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { useAdmin } from "@/context/AdminContext";

interface DhanStatusState {
  loading: boolean;
  configured: boolean;
  clientId: string;
  maskedClientId: string;
  hasToken: boolean;
  feedSource: string;
  latencyMs: number | null;
  lastTestedAt: string | null;
}

export function DhanApiKeyCard() {
  const { settings, updateSettings } = useAdmin();
  const [clientId, setClientId] = useState(settings.dhanClientId || "1114340693");
  const [accessToken, setAccessToken] = useState(settings.dhanAccessToken || "");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [status, setStatus] = useState<DhanStatusState>({
    loading: true,
    configured: false,
    clientId: "1114340693",
    maskedClientId: "111****693",
    hasToken: false,
    feedSource: "Checking...",
    latencyMs: null,
    lastTestedAt: null,
  });

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/admin/dhan", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setStatus((prev) => ({
          ...prev,
          loading: false,
          configured: data.configured,
          clientId: data.clientId || "1114340693",
          maskedClientId: data.maskedClientId || "111****693",
          hasToken: data.hasToken,
          feedSource: data.feedSource,
        }));
        if (data.clientId) {
          setClientId(data.clientId);
        }
      }
    } catch {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const clean = text.trim();
        setAccessToken(clean);
        updateSettings({ dhanAccessToken: clean });
        toast.success("Pasted Dhan Access Token from clipboard");
      } else {
        toast.error("Clipboard is empty");
      }
    } catch {
      toast.error("Could not read from clipboard — please paste manually");
    }
  };

  const handleTest = async () => {
    const tokenToTest = accessToken.trim() || settings.dhanAccessToken;
    if (!tokenToTest) {
      toast.error("Enter or paste your Dhan Access Token before testing");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/admin/dhan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          clientId: clientId.trim(),
          accessToken: tokenToTest,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus((prev) => ({
          ...prev,
          latencyMs: data.latencyMs,
          lastTestedAt: new Date().toLocaleTimeString(),
        }));
        toast.success(
          `DhanHQ API authenticated! Live quote ping verified (${data.latencyMs ?? 100}ms)`,
        );
      } else {
        toast.error(`DhanHQ test failed: ${data.message || data.error || "Authentication failed"}`);
      }
    } catch (e) {
      toast.error(`Connection error: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const tokenToSave = accessToken.trim();
    if (!tokenToSave) {
      toast.error("Enter or paste your Dhan Access Token to save");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/dhan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          clientId: clientId.trim(),
          accessToken: tokenToSave,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        updateSettings({
          dhanClientId: clientId.trim(),
          dhanAccessToken: tokenToSave,
        });
        setStatus((prev) => ({
          ...prev,
          configured: true,
          hasToken: true,
          feedSource: data.feedSource || "DhanHQ Live Direct Feed v2",
          latencyMs: data.latencyMs ?? null,
          lastTestedAt: new Date().toLocaleTimeString(),
        }));
        toast.success(data.message || "DhanHQ access token saved and activated!");
      } else {
        toast.error(data.error || "Failed to save DhanHQ token");
      }
    } catch (e) {
      toast.error(`Save error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/dhan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        setAccessToken("");
        updateSettings({ dhanAccessToken: "" });
        setStatus((prev) => ({
          ...prev,
          configured: false,
          hasToken: false,
          feedSource: "NSE Live Feed (DhanHQ Offline)",
          latencyMs: null,
        }));
        toast.info(data.message || "DhanHQ token cleared");
      }
    } catch (e) {
      toast.error(`Clear error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const isLive = status.configured || status.hasToken || Boolean(accessToken.trim());

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-surface/80 via-surface/60 to-amber-950/10 p-6 backdrop-blur shadow-lg space-y-6">
      {/* Background radial accent */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/5 blur-3xl" />

      {/* Header with pill and live status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
            <Zap className="h-3.5 w-3.5 text-amber-400" /> BROKER API • DHANHQ LIVE FEED
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
                  isLive ? "bg-amber-400 opacity-75" : "bg-muted-foreground opacity-30"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isLive ? "bg-amber-500" : "bg-muted-foreground"
                }`}
              />
            </span>
            <span className={isLive ? "text-amber-400 font-semibold" : "text-muted-foreground"}>
              {isLive ? "LIVE FEED ACTIVE (v2)" : "NOT CONFIGURED / NSE FALLBACK"}
            </span>
          </span>
        </div>

        <a
          href="https://web.dhan.co"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          <span>Generate Token on Dhan Web</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Title & Description */}
      <div>
        <h4 className="font-display text-base font-semibold text-foreground">
          DhanHQ Broker Live Marketfeed &amp; Access Token
        </h4>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-3xl">
          Direct authorized connection via DhanHQ API v2. Streams tick-by-tick real-time NSE stock
          and index quotes, live Option Chain strike data with Greeks (Delta, Gamma, Theta, Vega),
          and supports automated paper / live trade routing.
        </p>
      </div>

      {/* Input Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Column 1: Client ID */}
        <div className="md:col-span-4 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Dhan Client ID</span>
            <span className="text-[10px] text-muted-foreground/80 font-mono">10 digits</span>
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              updateSettings({ dhanClientId: e.target.value.trim() });
            }}
            placeholder="e.g. 1114340693"
            className="w-full rounded-xl border border-border/80 bg-background/60 px-3.5 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
          <p className="text-[11px] text-muted-foreground">
            Your DhanHQ trading client ID (default: <code>1114340693</code>).
          </p>
        </div>

        {/* Column 2: Access Token */}
        <div className="md:col-span-8 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Dhan Access Token (JWT)</span>
            <span className="text-[10px] text-amber-400/90 font-medium">Valid for 24 hours</span>
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Paste DhanHQ Access Token (eyJhbGciOi...)"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-border/80 bg-background/60 pl-3.5 pr-28 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={handlePaste}
                title="Paste from clipboard"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Clipboard className="h-3 w-3" /> Paste
              </button>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? "Hide token" : "Show token"}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Generate your daily token from{" "}
            <strong>Dhan Web &gt; My Profile &gt; DhanHQ APIs</strong>.
          </p>
        </div>
      </div>

      {/* Status & Diagnostic KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-border/60 bg-background/40 p-3.5">
        <div>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
            Feed Source
          </span>
          <span className="text-xs font-semibold text-foreground flex items-center gap-1 mt-0.5">
            <Activity className="h-3 w-3 text-amber-400" />
            <span className="truncate">{status.feedSource}</span>
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
            Active Client ID
          </span>
          <span className="text-xs font-mono text-foreground mt-0.5 block truncate">
            {clientId || status.maskedClientId || "—"}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
            Token Status
          </span>
          <span className="text-xs font-medium mt-0.5 block">
            {accessToken.trim() || status.hasToken ? (
              <span className="text-emerald-400 font-semibold">Configured</span>
            ) : (
              <span className="text-muted-foreground">Not Set</span>
            )}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
            Ping Latency
          </span>
          <span className="text-xs font-mono text-foreground mt-0.5 block">
            {status.latencyMs !== null ? `${status.latencyMs}ms` : "—"}
            {status.lastTestedAt ? (
              <span className="text-[10px] text-muted-foreground ml-1">
                ({status.lastTestedAt})
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving || (!accessToken.trim() && !settings.dhanAccessToken)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Play className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Testing Ping..." : "Test Dhan Connection"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || testing || !accessToken.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save & Activate Token"}
          </button>

          {(accessToken || status.hasToken) && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving || testing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Token
            </button>
          )}
        </div>

        <span className="text-[11px] text-muted-foreground">
          Tokens expire every 24 hours · Re-save daily before 09:15 IST
        </span>
      </div>
    </div>
  );
}
