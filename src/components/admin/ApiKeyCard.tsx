import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Globe,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useAdmin, type KeyInfo, type KeyScope } from "@/context/AdminContext";
import { appUrl } from "@/lib/app-url";
import { API_KEY_PREFIX, maskApiKey } from "./admin-constants";
import { SCOPE_LABEL } from "./useKeyActions";

/** Tailwind needs literal class names, so each scope spells out its palette. */
const THEMES = {
  nse: {
    card: "border-emerald-500/30 bg-gradient-to-br from-surface/80 via-surface/60 to-emerald-950/10",
    glow: "bg-emerald-500/5",
    pill: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
    status: "text-emerald-400",
    ping: "bg-emerald-400",
    dot: "bg-emerald-500",
    test: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
    accent: "text-emerald-400",
    key: "text-emerald-400/90",
    keyInline: "text-emerald-300",
    icon: Activity,
    pillText: "1st KEY • NSE F&O",
    testText: "Test NSE Key",
    keyField: "nseFnoApiKey",
  },
  global: {
    card: "border-cyan-500/30 bg-gradient-to-br from-surface/80 via-surface/60 to-cyan-950/10",
    glow: "bg-cyan-500/5",
    pill: "border-cyan-500/40 bg-cyan-500/15 text-cyan-400",
    status: "text-cyan-400",
    ping: "bg-cyan-400",
    dot: "bg-cyan-500",
    test: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
    accent: "text-cyan-400",
    key: "text-cyan-400/90",
    keyInline: "text-cyan-300",
    icon: Globe,
    pillText: "2nd KEY • GLOBAL",
    testText: "Test Global Key",
    keyField: "globalApiKey",
  },
} as const;

function formatStamp(v: string | number | null): string {
  if (v === null || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

function formatStampTime(v: string | number | null): string {
  if (v === null || v === "") return "Never";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export function ApiKeyCard({
  scope,
  title,
  description,
  scopes,
  curlPath,
  info,
  freshKey,
  busy,
  testing,
  onTest,
  onRotate,
  onRevoke,
  onDismissFresh,
}: {
  scope: KeyScope;
  title: string;
  description: ReactNode;
  scopes: string;
  /** Path (incl. query) used in the curl example. */
  curlPath: string;
  info: KeyInfo;
  freshKey: string | null;
  busy: boolean;
  testing: boolean;
  onTest: () => void;
  onRotate: () => void;
  onRevoke: () => void;
  onDismissFresh: () => void;
}) {
  const t = THEMES[scope];
  const Icon = t.icon;
  const { settings, setSessionApiKey } = useAdmin();
  const sessionKey = settings[t.keyField];
  const [copied, setCopied] = useState(false);
  const [existing, setExisting] = useState("");

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast.success("API Key copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Could not copy — select the key and copy it manually"),
    );
  };

  const handleUseExisting = () => {
    const k = existing.trim();
    if (!k.startsWith(API_KEY_PREFIX[scope]) || k.length < 24) {
      toast.error(`Key must start with ${API_KEY_PREFIX[scope]}`);
      return;
    }
    setSessionApiKey(scope, k);
    setExisting("");
    toast.success("Key loaded for tests in this session (not saved)");
  };

  const shown = sessionKey
    ? maskApiKey(sessionKey)
    : info.configured
      ? `${API_KEY_PREFIX[scope]}${"•".repeat(24)}`
      : "No key configured — rotate to generate one";

  return (
    <div
      className={`rounded-2xl border ${t.card} p-6 shadow-xl backdrop-blur relative overflow-hidden`}
    >
      <div
        className={`absolute top-0 right-0 h-40 w-40 ${t.glow} blur-3xl pointer-events-none rounded-full`}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${t.pill}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.pillText}
            </span>
            {info.configured ? (
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${t.status}`}>
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${t.ping} opacity-75`}
                  ></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${t.dot}`}></span>
                </span>
                Active &amp; Ready
              </span>
            ) : (
              <span className="text-xs font-semibold text-amber-400">Not configured</span>
            )}
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${t.test}`}
          >
            {testing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            {t.testText}
          </button>
        </div>
      </div>

      {freshKey && (
        <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            New {SCOPE_LABEL[scope]} key — copy it now. It won&apos;t be shown again.
          </div>
          <div
            className={`mt-2 break-all rounded-lg border border-border/80 bg-background/80 p-3 font-mono text-xs font-semibold select-all ${t.keyInline}`}
          >
            {freshKey}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy(freshKey)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition shadow-sm"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied!" : "Copy Key"}</span>
            </button>
            <button
              type="button"
              onClick={onDismissFresh}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
            >
              I&apos;ve saved it
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Only a SHA-256 hash is stored on the server, so this key cannot be recovered later —
            rotate to issue a new one.
          </p>
        </div>
      )}

      {/* Key Display Bar */}
      <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Active Authorization Key (Header:{" "}
              <code className={`font-mono ${t.accent}`}>x-api-key</code>)
            </span>
            <div
              className={`font-mono text-xs sm:text-sm font-semibold select-all break-all ${t.key}`}
            >
              {shown}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRotate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition disabled:opacity-50"
              title="Generate a new key (invalidates the current one)"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              <span>{info.configured ? "Rotate" : "Generate"}</span>
            </button>
            {info.configured && (
              <button
                type="button"
                onClick={onRevoke}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition disabled:opacity-50"
                title="Revoke this key"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Revoke</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
          <span>
            Scope: <strong className="text-foreground">{scopes}</strong>
          </span>
          <span>
            CORS: <strong className={t.accent}>Access-Control-Allow-Origin: *</strong>
          </span>
          <span>
            Configured since:{" "}
            <strong className="text-foreground">
              {info.configured ? formatStamp(info.createdAt) : "—"}
            </strong>
          </span>
          <span>
            Last used:{" "}
            <strong className={t.accent}>
              {info.configured ? formatStampTime(info.lastUsedAt) : "—"}
            </strong>
          </span>
        </div>

        <details className="mt-3 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            Use an existing key for the Test buttons (kept in memory only, never saved)
          </summary>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
              placeholder={`${API_KEY_PREFIX[scope]}…`}
              autoComplete="off"
              spellCheck={false}
              className="admin-input h-8 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleUseExisting}
              disabled={!existing.trim()}
              className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              Use key
            </button>
          </div>
        </details>
      </div>

      {/* cURL and Endpoint Guide */}
      <div className="mt-4 rounded-xl border border-border/50 bg-background/40 p-3.5 text-xs font-mono space-y-1.5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Code2 className={`h-3.5 w-3.5 ${t.accent}`} /> Live Endpoint (Paper Trading Webpage
            Integration)
          </span>
          <span className={`text-[11px] ${t.accent}`}>GET JSON</span>
        </div>
        <div className="overflow-x-auto text-muted-foreground select-all py-1">
          <span className="text-amber-400">curl</span> -H{" "}
          <span className={t.keyInline}>&quot;x-api-key: $IQ_API_KEY&quot;</span> \<br />
          &nbsp;&nbsp;{appUrl(curlPath)}
        </div>
      </div>
    </div>
  );
}
