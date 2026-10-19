import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDhanStatus, connectDhanAccount, disconnectDhanAccount } from "@/lib/dhan.functions";
import { ExternalLink, ShieldCheck, Zap, X, RefreshCw, KeyRound, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function DhanConnectModal({
  isOpen,
  onClose,
  onStatusChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (source: string) => void;
}) {
  const fetchStatus = useServerFn(getDhanStatus);
  const connectFn = useServerFn(connectDhanAccount);
  const disconnectFn = useServerFn(disconnectDhanAccount);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ connected: boolean; clientId: string | null; feedSource: string }>({
    connected: false,
    clientId: null,
    feedSource: "Checking...",
  });
  const [clientId, setClientId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const refreshStatus = async () => {
    try {
      const res = await fetchStatus();
      setStatus(res as any);
      if ((res as any).configuredClientId) {
        setClientId((prev) => prev || (res as any).configuredClientId);
      }
      if (onStatusChange) onStatusChange(res.feedSource);
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
      setErrorMsg("");
    }
  }, [isOpen]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !accessToken.trim()) {
      setErrorMsg("Both Client ID and Access Token are required");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await connectFn({
        data: {
          clientId: clientId.trim(),
          accessToken: accessToken.trim(),
        },
      });

      if (res.ok) {
        toast.success(res.message);
        await refreshStatus();
        setAccessToken("");
        setTimeout(() => onClose(), 800);
      } else {
        setErrorMsg(res.message);
        toast.error(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to connect to DhanHQ");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const res = await disconnectFn();
      toast.info(res.message);
      await refreshStatus();
      setClientId("");
      setAccessToken("");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-hero p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/60 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">DhanHQ v2 API Feed</h2>
            <p className="text-xs text-muted-foreground">Colocated ultra-low latency live tick feed</p>
          </div>
        </div>

        {/* Current status card */}
        <div className="mt-5 rounded-xl border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  status.connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <p className="text-xs font-semibold">
                {status.connected ? "Connected to DhanHQ" : "NSE Fallback Feed Active"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                status.connected
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
              }`}
            >
              {status.connected ? "Direct Feed" : "Fallback"}
            </span>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {status.connected
              ? `Authorized for client ID: ${status.clientId}. Streaming live stock prices and historical data directly from Dhan colocation.`
              : "Currently using parallel NSE real-time feeds. Enter your Dhan Client ID and Access Token to activate direct Dhan broker feeds."}
          </p>

          {status.connected && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Live ticks streaming
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
              >
                {loading ? "Disconnecting..." : "Disconnect Dhan"}
              </button>
            </div>
          )}
        </div>

        {/* Input credentials form */}
        {!status.connected && (
          <form onSubmit={handleConnect} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Dhan Client ID (10 digits)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. 1000543210"
                required
                className="h-10 w-full rounded-lg border border-border bg-surface/60 px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Dhan 24-hr Access Token (JWT)
                </label>
                <a
                  href="https://dhanhq.co"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Get Token <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Paste your 24-hr Dhan JWT access token here..."
                rows={3}
                required
                className="w-full rounded-lg border border-border bg-surface/60 p-3 text-xs font-mono outline-none focus:border-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                <KeyRound className="h-3 w-3 text-primary" />
                Tokens are valid for 24 hours per SEBI guidelines.
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-50"
              >
                {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {loading ? "Authenticating..." : "Test & Connect Dhan"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Credentials are stored securely and never shared with 3rd parties.</span>
        </div>
      </div>
    </div>
  );
}
