import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAdmin, PERMANENT_CHAT_IDS, DEFAULT_NSE_FNO_KEY, DEFAULT_GLOBAL_KEY, type CustomApiKey } from "@/context/AdminContext";
import { DESKTOP_SYMBOLS, NOTIFICATIONS_LOG, USERS_MOCK } from "@/lib/desktop-data";
import { STOCKS } from "@/lib/market-data";
import { readPublicSheet } from "@/lib/sheets.functions";
import {
  getIndianHighProfitTrades,
  getGlobalHighProfitTrades,
  getMarketTiming,
} from "@/lib/trade-analysis";
import {
  Send,
  RefreshCw,
  Trash2,
  Download,
  LogOut,
  Lock,
  ExternalLink,
  Plus,
  X,
  RotateCcw,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Globe,
  Activity,
  Terminal,
  ArrowRight,
  Play,
  CheckCircle2,
  Code2,
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/desktop/admin")({
  component: AdminPanel,
});

type Tab =
  | "overview"
  | "apikeys"
  | "telegram"
  | "sheets"
  | "stocks"
  | "notifications"
  | "users";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "apikeys", label: "API Keys" },
  { id: "telegram", label: "Telegram" },
  { id: "sheets", label: "Google Sheets" },
  { id: "stocks", label: "Stocks" },
  { id: "notifications", label: "Notifications" },
  { id: "users", label: "Users" },
];

function AdminPanel() {
  const { isAdmin, logout } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");

  if (!isAdmin) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-md rounded-2xl border border-border bg-surface/60 p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 font-display text-xl font-semibold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Triple-click the footer at the bottom of the page to sign in.
          </p>
          <Link
            to="/desktop"
            className="mt-6 inline-block rounded-lg border border-border bg-background/50 px-4 py-2 text-sm hover:bg-accent"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Admin Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure integrations, manage users, and monitor notifications.
          </p>
        </div>
        <button
          onClick={() => {
            logout();
            toast.success("Signed out of admin");
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm transition ${
              tab === t.id
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview onSelectTab={setTab} />}
      {tab === "apikeys" && <ApiKeysTab />}
      {tab === "telegram" && <TelegramTab />}
      {tab === "sheets" && <SheetsTab />}
      {tab === "stocks" && <StocksTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}

/* -------- Overview -------- */
function Overview({ onSelectTab }: { onSelectTab?: (t: Tab) => void }) {
  const { settings } = useAdmin();
  const activeKeysCount = [
    settings.nseFnoApiKey,
    settings.globalApiKey,
  ].filter(Boolean).length;
  const stats = [
    { l: "Total users", v: USERS_MOCK.length.toString() },
    { l: "Active today", v: USERS_MOCK.filter((u) => u.lastLogin === "2026-07-14").length.toString() },
    { l: "Configured API Keys", v: activeKeysCount.toString() },
    { l: "Notifications sent", v: NOTIFICATIONS_LOG.filter((n) => n.status === "Sent").length.toString() },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border border-border bg-surface/60 p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.l}</p>
            <p className="mt-2 font-display text-2xl font-semibold">{s.v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <h3 className="font-display text-sm font-semibold">Quick actions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onSelectTab?.("apikeys")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Create API Key
          </button>
          {["Send test Telegram", "Refresh sheet data", "Export notifications"].map((a) => (
            <button
              key={a}
              onClick={() => toast.info(`${a} — mock`)}
              className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------- Telegram -------- */
function TelegramTab() {
  const { settings, updateSettings } = useAdmin();
  const [sending, setSending] = useState(false);
  const [fnoSymbol, setFnoSymbol] = useState("NIFTY");
  const [newChatId, setNewChatId] = useState("");

  const chatIds = settings.telegramChatId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const handleAddChatId = () => {
    const trimmed = newChatId.trim();
    if (!trimmed) return;
    const toAdd = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...chatIds, ...toAdd]));
    updateSettings({ telegramChatId: merged.join(",") });
    setNewChatId("");
    toast.success(`Added ${toAdd.length} Chat ID(s)`);
  };

  const handleRemoveChatId = (idToRemove: string) => {
    const filtered = chatIds.filter((id) => id !== idToRemove);
    updateSettings({ telegramChatId: filtered.join(",") });
    toast.info(`Removed Chat ID ${idToRemove}`);
  };

  const handleResetToDefaults = () => {
    updateSettings({ telegramChatId: PERMANENT_CHAT_IDS.join(",") });
    toast.success("Reset Chat IDs to default recipients");
  };

  const handleClearAllChatIds = () => {
    updateSettings({ telegramChatId: "" });
    toast.info("Cleared all Chat IDs");
  };

  const sendTest = async () => {
    if (!settings.masterEnabled) {
      toast.error("Master toggle is OFF — enable it to send Telegram messages");
      return;
    }
    if (!settings.telegramBotToken || chatIds.length === 0) {
      toast.error("Bot token and at least one Chat ID are required");
      return;
    }
    setSending(true);
    try {
      const results = await Promise.all(
        chatIds.map(async (chat_id) => {
          const res = await fetch(
            `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id,
                text: "✅ InvestIQ test notification — your bot is wired up correctly.",
              }),
            },
          );
          const json = (await res.json()) as { ok: boolean; description?: string };
          return { chat_id, ...json };
        }),
      );
      const okCount = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      if (okCount) toast.success(`Test sent to ${okCount}/${chatIds.length} chat(s)`);
      if (failed.length)
        toast.error(`Failed: ${failed.map((f) => `${f.chat_id}: ${f.description}`).join(" · ")}`);
    } catch (e) {
      toast.error(`Send failed: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const master = settings.masterEnabled;
  const guard = (fn: () => void) => () => {
    if (!master) {
      toast.error("Master toggle is OFF — enable it first");
      return;
    }
    fn();
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <h3 className="font-display text-lg font-semibold">Telegram Settings</h3>

      {/* MASTER TOGGLE */}
      <div
        className={`mt-5 rounded-xl border p-4 ${
          master
            ? "border-primary/40 bg-primary/5"
            : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-sm font-semibold">
              🤖 Master Telegram bot control
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {master
                ? "🟢 ENABLED — all Telegram notifications are active."
                : "🔴 DISABLED — every alert (scheduled or manual) is blocked."}
            </p>
          </div>
          <Toggle
            checked={master}
            onChange={(v) => updateSettings({ masterEnabled: v })}
            label={master ? "ENABLED" : "DISABLED"}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Bot token">
          <input
            value={settings.telegramBotToken}
            onChange={(e) => updateSettings({ telegramBotToken: e.target.value })}
            placeholder="e.g. 8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc"
            className="admin-input"
          />
        </Field>
        <Field label={`Chat IDs (${chatIds.length} configured recipient${chatIds.length === 1 ? "" : "s"} — editable)`}>
          <input
            value={settings.telegramChatId}
            onChange={(e) => updateSettings({ telegramChatId: e.target.value })}
            placeholder="e.g. 7350570004, 5589831995 (comma-separated)"
            className="admin-input font-mono text-xs"
          />
        </Field>
      </div>

      {/* Recipient Management Controls & Interactive Badges */}
      <div className="mt-4 rounded-xl border border-border/80 bg-background/50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Configured Recipients ({chatIds.length})
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You have full manual edit access. Type or paste comma-separated IDs in the field above, or manage them below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Reset to default permanent recipients"
            >
              <RotateCcw className="h-3 w-3" /> Reset to defaults
            </button>
            {chatIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllChatIds}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/20 transition-colors"
                title="Clear all configured chat IDs"
              >
                <Trash2 className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
        </div>

        {/* Quick Add input */}
        <div className="mt-3 flex items-center gap-2 max-w-md">
          <input
            value={newChatId}
            onChange={(e) => setNewChatId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddChatId();
              }
            }}
            placeholder="Add Chat ID (e.g. 7350570004)"
            className="admin-input text-xs font-mono py-1.5"
          />
          <button
            type="button"
            onClick={handleAddChatId}
            disabled={!newChatId.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> Add ID
          </button>
        </div>

        {/* Badges / Pills list */}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {chatIds.length === 0 ? (
            <p className="text-xs text-amber-500 font-medium py-1">
              ⚠️ No chat IDs configured. Enter at least one Telegram Chat ID to receive outbound alerts.
            </p>
          ) : (
            chatIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:border-primary/50"
              >
                <span>{id}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveChatId(id)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                  title={`Remove ${id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className={`mt-6 ${master ? "" : "opacity-50 pointer-events-none"}`}>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Notification types (only fire when master is ON)
        </p>
        <div className="mt-3 space-y-2">
          <Toggle
            checked={settings.notifyNews}
            onChange={(v) => updateSettings({ notifyNews: v })}
            label="Stock &amp; ETF news — batched every 10 minutes during market hours"
          />
          <Toggle
            checked={settings.notifyQuarterly}
            onChange={(v) => updateSettings({ notifyQuarterly: v })}
            label="Quarterly report notifications (event-based — only when a company files results)"
          />
          <Toggle
            checked={settings.notifyRSI}
            onChange={(v) => updateSettings({ notifyRSI: v })}
            label="Daily RSI alerts (11:45 AM IST · Mon–Fri)"
          />
          <Toggle
            checked={settings.notifyPreMarket}
            onChange={(v) => updateSettings({ notifyPreMarket: v })}
            label="Pre-market top-gainers alert (9:00 AM IST · Mon–Fri)"
          />
          <Toggle
            checked={settings.notifyPostMarket}
            onChange={(v) => updateSettings({ notifyPostMarket: v })}
            label="Post-market summary + sectors + trending (4:15 / 4:30 / 4:45 PM IST · Mon–Fri)"
          />
          <Toggle
            checked={settings.notifyIpo}
            onChange={(v) => updateSettings({ notifyIpo: v })}
            label="IPO alerts — only for NEW IPOs (9:30 AM &amp; 1:30 PM check · never re-sent)"
          />
          <Toggle
            checked={settings.notifyFunds}
            onChange={(v) => updateSettings({ notifyFunds: v })}
            label="Mutual Fund digest — weekly, Monday 9:30 AM IST only"
          />
        </div>

      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          disabled={sending || !master}
          onClick={sendTest}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send test message"}
        </button>
        <button
          disabled={sending || !master}
          onClick={async () => {
            setSending(true);
            try {
              const res = await fetch("/api/public/hooks/rsi-alert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatIds }),
              });
              const json = (await res.json()) as { ok: boolean; sent?: number; error?: string };
              if (json.ok) toast.success(`RSI alert sent — ${json.sent} ETFs to ${chatIds.length} chat(s)`);
              else toast.error(`Alert failed: ${json.error}`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send RSI alert now
        </button>
        <button
          disabled={sending || !master}
          onClick={async () => {
            setSending(true);
            try {
              const res = await fetch("/api/public/hooks/premarket-alert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatIds }),
              });
              const j = (await res.json()) as { ok: boolean; delivered?: number; gainers?: number; error?: string };
              if (j.ok) toast.success(`Pre-market alert sent — ${j.gainers} gainers to ${j.delivered ?? chatIds.length} chat(s)`);
              else toast.error(`Alert failed: ${j.error ?? "unknown"}`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send Pre-market now
        </button>
        <button
          disabled={sending || !master}
          onClick={async () => {
            setSending(true);
            try {
              const res = await fetch("/api/public/hooks/postmarket-alert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ section: "all", chatIds }),
              });
              const j = (await res.json()) as { ok: boolean; delivered?: number; scanned?: number; error?: string };
              if (j.ok) toast.success(`Post-market alert sent — ${j.scanned} stocks scanned, ${j.delivered ?? chatIds.length} chat(s)`);
              else toast.error(`Alert failed: ${j.error ?? "unknown"}`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send Post-market now
        </button>
        <button
          disabled={sending || !master}
          onClick={async () => {
            setSending(true);
            try {
              const res = await fetch("/api/public/hooks/ipo-alert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: true, chatIds }),
              });
              const j = (await res.json()) as { ok: boolean; delivered?: number; sent?: number; error?: string };
              if (j.ok) toast.success(`IPO alert sent — ${j.sent} IPOs to ${j.delivered ?? chatIds.length} chat delivery(ies)`);
              else toast.error(`Alert failed: ${j.error ?? "unknown"}`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send IPO alert now
        </button>
        <button
          disabled={sending || !master}
          onClick={async () => {
            setSending(true);
            try {
              const res = await fetch("/api/public/hooks/funds-alert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatIds }),
              });
              const j = (await res.json()) as { ok: boolean; delivered?: number; categories?: string[]; error?: string };
              if (j.ok) toast.success(`Fund digest sent — ${j.categories?.length ?? 0} categories, ${j.delivered ?? chatIds.length} deliveries`);
              else toast.error(`Alert failed: ${j.error ?? "unknown"}`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send Fund digest now
        </button>
        <div className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1">
          <select
            value={fnoSymbol}
            onChange={(e) => setFnoSymbol(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="NIFTY">NIFTY 50</option>
            <option value="BANKNIFTY">BANK NIFTY</option>
            <option value="SENSEX">SENSEX</option>
          </select>
          <button
            disabled={sending || !master}
            onClick={async () => {
              setSending(true);
              try {
                const res = await fetch("/api/fno-alert", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ symbol: fnoSymbol, chatIds }),
                });
                const j = (await res.json()) as {
                  ok: boolean; trades?: number; notified?: { sent: number; total: number }; error?: string;
                };
                if (j.ok)
                  toast.success(
                    `F&O alert sent — ${j.trades ?? 0} trade card(s), ${j.notified?.sent ?? 0}/${j.notified?.total ?? 0} deliveries`,
                  );
                else toast.error(`F&O alert failed: ${j.error ?? "unknown"}`);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSending(false);
              }
            }}
            className="inline-flex items-center gap-2 px-2 py-1 text-sm text-primary disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Send F&amp;O alert now
          </button>
        </div>

        <button
          onClick={() => toast.success("Settings saved")}
          className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
        >
          Save settings
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Auto-dispatch (only when Master is ON): RSI <b>11:45 AM · Mon–Fri</b> · Pre-market <b>9:00 AM · Mon–Fri</b> ·
        Post-market summary/sectors/trending <b>4:15 / 4:30 / 4:45 PM · Mon–Fri</b> · IPO check <b>9:30 AM &amp; 1:30 PM</b> (only when a NEW IPO is detected — no re-sends) ·
        News <b>every 10 min during market hours</b> · Mutual Funds <b>Monday 9:30 AM only</b> · Quarterly reports — event-based (manual/announcement only).
      </p>

    </div>
  );
}

/* -------- Sheets -------- */
type EtfRow = { name: string; rsi: number; price: string; change: string };

function SheetsTab() {
  const { settings, updateSettings } = useAdmin();
  const readSheet = useServerFn(readPublicSheet);
  const [preview, setPreview] = useState<EtfRow[] | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const colIndex = (letter: string) =>
    letter
      .toUpperCase()
      .split("")
      .reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0) - 1;

  const testRead = async () => {
    setLoading(true);
    try {
      const res = await readSheet({
        data: { url: settings.sheetUrl, sheetName: settings.sheetName },
      });
      if (!res.ok) {
        toast.error(`Sheet read failed: ${res.error}`);
        setPreview(null);
        return;
      }
      const rows = res.rows;
      if (rows.length < 2) {
        toast.error("Sheet has no data rows");
        return;
      }
      setHeaders(rows[0]);
      // Find the "Today Buy" cell; that section can sit to the right of the
      // main table (columns E–G in this sheet). Use its column as Rank,
      // +1 as RSI, +2 as ETF name/code — overriding the configured letters.
      let baseCol = -1;
      let startIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const idx = rows[i].findIndex(
          (c) => (c ?? "").trim().toLowerCase() === "today buy",
        );
        if (idx >= 0) {
          baseCol = idx;
          startIdx = i;
          break;
        }
      }
      const iPrice = baseCol >= 0 ? baseCol : colIndex(settings.colPrice);
      const iRSI = baseCol >= 0 ? baseCol + 1 : colIndex(settings.colRSI);
      const iName = baseCol >= 0 ? baseCol + 2 : colIndex(settings.colName);
      const scan = startIdx >= 0 ? rows.slice(startIdx + 1) : rows.slice(1);
      const data = scan
        .map((r) => ({
          name: (r[iName] ?? "").trim(),
          rsi: Number(r[iRSI]) || 0,
          price: r[iPrice] ?? "",
          change: "—",
        }))
        .filter((r) => r.name && r.rsi > 0 && /^(NSE|BSE):/i.test(r.name))
        .slice(0, 5);
      setPreview(data);
      toast.success(`Fetched ${data.length} rows from your sheet`);
    } catch (e) {
      toast.error(`Read failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <h3 className="font-display text-lg font-semibold">Google Sheets Configuration</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Sheet must be shared as "Anyone with the link — Viewer".
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="Spreadsheet URL" wide>
          <input
            value={settings.sheetUrl}
            onChange={(e) => updateSettings({ sheetUrl: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Sheet name">
          <input
            value={settings.sheetName}
            onChange={(e) => updateSettings({ sheetName: e.target.value })}
            className="admin-input"
          />
        </Field>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Field label="Column: ETF name">
          <input
            value={settings.colName}
            onChange={(e) => updateSettings({ colName: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Column: RSI value">
          <input
            value={settings.colRSI}
            onChange={(e) => updateSettings({ colRSI: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Column: Price">
          <input
            value={settings.colPrice}
            onChange={(e) => updateSettings({ colPrice: e.target.value })}
            className="admin-input"
          />
        </Field>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-background/40 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Schedule</p>
        <p className="mt-1">
          Market open: 09:15 AM IST · RSI alert dispatch: 11:45 AM IST · Mon–Fri
        </p>
      </div>
      <div className="mt-5 flex gap-2">
        <button
          disabled={loading}
          onClick={testRead}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Reading…" : "Test read"}
        </button>
        <button
          onClick={() => toast.success("Configuration saved")}
          className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
        >
          Save configuration
        </button>
      </div>
      {headers && (
        <p className="mt-4 text-xs text-muted-foreground">
          Detected columns: {headers.map((h, i) => `${String.fromCharCode(65 + i)}=${h || "—"}`).join(" · ")}
        </p>
      )}
      {preview && preview.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Top 5 lowest RSI ETFs (from your sheet)
          </p>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ETF</th>
                <th>RSI</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((e) => (
                <tr key={e.name}>
                  <td className="font-medium">{e.name}</td>
                  <td>{e.rsi.toFixed(2)}</td>
                  <td>{e.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------- API Keys -------- */
function ApiKeysTab() {
  const {
    settings,
    rotateNseFnoApiKey,
    rotateGlobalApiKey,
  } = useAdmin();

  const [revealed, setRevealed] = useState<Record<string, boolean>>({
    nse: false,
    global: false,
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const indianTrades = getIndianHighProfitTrades();
  const globalTrades = getGlobalHighProfitTrades();
  const indianTiming = getMarketTiming("NSE_FNO");
  const globalTiming = getMarketTiming("GLOBAL_US");

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(id);
    toast.success("API Key copied to clipboard");
    setTimeout(() => {
      setCopiedKey((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  const maskKeyStr = (str: string) => {
    if (!str || str.length < 10) return "••••••••••••";
    return `${str.slice(0, 8)}${"•".repeat(Math.max(12, str.length - 12))}${str.slice(-4)}`;
  };

  type LiveActionType =
    | "NSE_FNO"
    | "GLOBAL"
    | "TRADE_ORDER"
    | "DISPATCH_NIFTY"
    | "DISPATCH_BANKNIFTY"
    | "DISPATCH_SPX"
    | "DISPATCH_NAS100"
    | "FETCH_ALL_TRADES"
    | "AUTO_TRADE_NSE"
    | "AUTO_TRADE_GLOBAL";

  const runLiveTest = async (type: LiveActionType) => {
    setTestingEndpoint(type);
    setTestResult(null);
    const activeNseKey = settings.nseFnoApiKey || DEFAULT_NSE_FNO_KEY;
    const activeGlobalKey = settings.globalApiKey || DEFAULT_GLOBAL_KEY;
    try {
      if (type === "NSE_FNO") {
        const res = await fetch("/api/v1/fno/signals?instrument=NIFTY%2050", {
          headers: { "x-api-key": activeNseKey },
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "GET /api/v1/fno/signals?instrument=NIFTY%2050",
          keyUsed: maskKeyStr(activeNseKey),
          data,
        });
        if (res.ok) toast.success("NSE F&O API Key & Market Analysis fetched!");
        else toast.error("NSE F&O API Key test failed");
      } else if (type === "GLOBAL") {
        const res = await fetch("/api/v1/global/signals?instrument=S%26P%20500", {
          headers: { "x-api-key": activeGlobalKey },
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "GET /api/v1/global/signals?instrument=S%26P%20500",
          keyUsed: maskKeyStr(activeGlobalKey),
          data,
        });
        if (res.ok) toast.success("GLOBAL API Key & US Market Analysis fetched!");
        else toast.error("GLOBAL API Key test failed");
      } else if (type === "TRADE_ORDER" || type === "DISPATCH_NIFTY") {
        const res = await fetch("/api/v1/trades/order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeNseKey,
          },
          body: JSON.stringify({
            symbol: "NIFTY 50",
            contract: "NIFTY50 22850 PE",
            action: "BUY",
            lots: 2,
            price: 138.0,
            target1: 195.0,
            target2: 245.0,
            stopLoss: 98.0,
          }),
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "POST /api/v1/trades/order (NIFTY 50 - 1st Key)",
          keyUsed: maskKeyStr(activeNseKey),
          data,
        });
        if (res.ok) toast.success("Dispatched Indian Trade: NIFTY 50 22850 PE to API Key!");
        else toast.error("Trade dispatch failed");
      } else if (type === "DISPATCH_BANKNIFTY") {
        const res = await fetch("/api/v1/trades/order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeNseKey,
          },
          body: JSON.stringify({
            symbol: "BANK NIFTY",
            contract: "BANKNIFTY 51200 CE",
            action: "BUY",
            lots: 2,
            price: 315.0,
            target1: 450.0,
            target2: 560.0,
            stopLoss: 220.0,
          }),
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "POST /api/v1/trades/order (BANK NIFTY - 1st Key)",
          keyUsed: maskKeyStr(activeNseKey),
          data,
        });
        if (res.ok) toast.success("Dispatched Indian Trade: BANKNIFTY 51200 CE to API Key!");
        else toast.error("Trade dispatch failed");
      } else if (type === "DISPATCH_SPX") {
        const res = await fetch("/api/v1/trades/order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeGlobalKey,
          },
          body: JSON.stringify({
            symbol: "S&P 500",
            contract: "SPX 5870 CALL",
            action: "BUY",
            lots: 2,
            price: 28.5,
            target1: 45.0,
            target2: 62.0,
            stopLoss: 18.5,
          }),
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "POST /api/v1/trades/order (S&P 500 - 2nd Key • US Live)",
          keyUsed: maskKeyStr(activeGlobalKey),
          data,
        });
        if (res.ok) toast.success("Dispatched US Trade: SPX 5870 CALL to API Key (US Session Live)!");
        else toast.error("Trade dispatch failed");
      } else if (type === "DISPATCH_NAS100") {
        const res = await fetch("/api/v1/trades/order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeGlobalKey,
          },
          body: JSON.stringify({
            symbol: "NASDAQ 100",
            contract: "NAS100 20450 CALL",
            action: "BUY",
            lots: 2,
            price: 50.0,
            target1: 78.0,
            target2: 105.0,
            stopLoss: 32.0,
          }),
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "POST /api/v1/trades/order (NASDAQ 100 - 2nd Key • US Live)",
          keyUsed: maskKeyStr(activeGlobalKey),
          data,
        });
        if (res.ok) toast.success("Dispatched US Trade: NAS100 20450 CALL to API Key (US Session Live)!");
        else toast.error("Trade dispatch failed");
      } else if (type === "FETCH_ALL_TRADES") {
        const res = await fetch("/api/v1/trades/order", {
          headers: { "x-api-key": activeNseKey },
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "GET /api/v1/trades/order (All Active Setups & Orders)",
          keyUsed: maskKeyStr(activeNseKey),
          data,
        });
        if (res.ok) toast.success("Fetched all active trades & market timing statuses!");
        else toast.error("Fetch trades failed");
      } else if (type === "AUTO_TRADE_NSE") {
        const res = await fetch("/api/v1/trades/auto", {
          headers: { "x-api-key": activeNseKey },
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "GET /api/v1/trades/auto (Automatic Best Trade Delivery - 1st Key)",
          keyUsed: maskKeyStr(activeNseKey),
          data,
        });
        if (res.ok) toast.success("Automatic Best Trade generated & delivered (No manual click required)!");
        else toast.error("Auto trade fetch failed");
      } else if (type === "AUTO_TRADE_GLOBAL") {
        const res = await fetch("/api/v1/trades/auto", {
          headers: { "x-api-key": activeGlobalKey },
        });
        const data = await res.json();
        setTestResult({
          status: res.status,
          ok: res.ok,
          endpoint: "GET /api/v1/trades/auto (Automatic Best Trade Delivery - 2nd Key • US Live)",
          keyUsed: maskKeyStr(activeGlobalKey),
          data,
        });
        if (res.ok) toast.success("Automatic US Best Trade generated & delivered (No manual click required)!");
        else toast.error("Auto trade fetch failed");
      }
    } catch (e: any) {
      setTestResult({ status: 500, ok: false, error: e?.message || "Network Error" });
      toast.error("Live test failed: network error");
    } finally {
      setTestingEndpoint(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">API Key Management</h3>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              2 Active Dedicated Keys
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Dedicated REST API keys for external paper trading webpages. Use the <strong>1st Key</strong> to stream NSE F&amp;O signals &amp; option chain data, and the <strong>2nd Key</strong> for Global index feeds and trade order execution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              rotateNseFnoApiKey();
              toast.success("New NSE F&O API key generated");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Rotate NSE Key
          </button>
          <button
            onClick={() => {
              rotateGlobalApiKey();
              toast.success("New Global API key generated");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Rotate Global Key
          </button>
        </div>
      </div>

      {/* SECTION 1: 1st Dedicated Key - NSE F&O */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-surface/80 via-surface/60 to-emerald-950/10 p-6 shadow-xl backdrop-blur relative overflow-hidden">
        <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/5 blur-3xl pointer-events-none rounded-full" />
        
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Activity className="h-3.5 w-3.5" /> 1st KEY • NSE F&amp;O
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Active &amp; Ready
              </span>
            </div>
            <h3 className="font-display text-xl font-bold text-foreground">
              NSE F&amp;O Signals &amp; Trading Engine Key
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dedicated REST authorization key for Indian market F&amp;O indices:{" "}
              <strong className="text-foreground">NIFTY 50 • BANK NIFTY • FIN NIFTY • SENSEX • MIDCAP NIFTY</strong>.
              Streams live entry/exit signals, confluence scores, target/stop-loss levels, and full option strike chain Greeks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runLiveTest("NSE_FNO")}
              disabled={testingEndpoint === "NSE_FNO"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
            >
              {testingEndpoint === "NSE_FNO" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              Test NSE Key
            </button>
          </div>
        </div>

        {/* Key Display Bar */}
        <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Active Authorization Key (Header: <code className="font-mono text-emerald-400">x-api-key</code>)
              </span>
              <div className="font-mono text-xs sm:text-sm font-semibold select-all text-emerald-400/90 break-all">
                {revealed.nse ? (settings.nseFnoApiKey || DEFAULT_NSE_FNO_KEY) : maskKeyStr(settings.nseFnoApiKey || DEFAULT_NSE_FNO_KEY)}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRevealed((p) => ({ ...p, nse: !p.nse }))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
              >
                {revealed.nse ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{revealed.nse ? "Hide" : "Reveal"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopy(settings.nseFnoApiKey || DEFAULT_NSE_FNO_KEY, "nse")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition shadow-sm"
              >
                {copiedKey === "nse" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === "nse" ? "Copied!" : "Copy Key"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  rotateNseFnoApiKey();
                  toast.success("New NSE F&O API key generated!");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
                title="Regenerate this key"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Rotate</span>
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
            <span>Scope: <strong className="text-foreground">read:signals, read:option_chain, write:paper_orders</strong></span>
            <span>CORS: <strong className="text-emerald-400">Access-Control-Allow-Origin: *</strong></span>
            <span>Created: <strong className="text-foreground">{settings.nseFnoApiKeyCreated || "2026-10-22"}</strong></span>
            <span>Status: <strong className="text-emerald-400">200 OK Live Ready</strong></span>
          </div>
        </div>

        {/* cURL and Endpoint Guide */}
        <div className="mt-4 rounded-xl border border-border/50 bg-background/40 p-3.5 text-xs font-mono space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-emerald-400" /> Live Endpoint (Paper Trading Webpage Integration)
            </span>
            <span className="text-[11px] text-emerald-400">GET JSON</span>
          </div>
          <div className="overflow-x-auto text-muted-foreground select-all py-1">
            <span className="text-amber-400">curl</span> -H <span className="text-emerald-300">"x-api-key: {settings.nseFnoApiKey || DEFAULT_NSE_FNO_KEY}"</span> \<br/>
            &nbsp;&nbsp;https://www.investiqq.me/api/v1/fno/signals?instrument=NIFTY%2050
          </div>
        </div>
      </div>

      {/* SECTION 2: 2nd Dedicated Key - GLOBAL */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-surface/80 via-surface/60 to-cyan-950/10 p-6 shadow-xl backdrop-blur relative overflow-hidden">
        <div className="absolute top-0 right-0 h-40 w-40 bg-cyan-500/5 blur-3xl pointer-events-none rounded-full" />
        
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400">
                <Globe className="h-3.5 w-3.5" /> 2nd KEY • GLOBAL
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                Active &amp; Ready
              </span>
            </div>
            <h3 className="font-display text-xl font-bold text-foreground">
              Global Indices &amp; Cross-Market API Key
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dedicated REST authorization key for Global World Indices:{" "}
              <strong className="text-foreground">S&amp;P 500 • NASDAQ 100 • DOW JONES</strong>.
              Streams international trend signals, regime indicators, breakout confirmation, and global correlations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runLiveTest("GLOBAL")}
              disabled={testingEndpoint === "GLOBAL"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition disabled:opacity-50"
            >
              {testingEndpoint === "GLOBAL" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              Test Global Key
            </button>
          </div>
        </div>

        {/* Key Display Bar */}
        <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Active Authorization Key (Header: <code className="font-mono text-cyan-400">x-api-key</code>)
              </span>
              <div className="font-mono text-xs sm:text-sm font-semibold select-all text-cyan-400/90 break-all">
                {revealed.global ? (settings.globalApiKey || DEFAULT_GLOBAL_KEY) : maskKeyStr(settings.globalApiKey || DEFAULT_GLOBAL_KEY)}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRevealed((p) => ({ ...p, global: !p.global }))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
              >
                {revealed.global ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{revealed.global ? "Hide" : "Reveal"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopy(settings.globalApiKey || DEFAULT_GLOBAL_KEY, "global")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30 transition shadow-sm"
              >
                {copiedKey === "global" ? <Check className="h-3.5 w-3.5 text-cyan-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === "global" ? "Copied!" : "Copy Key"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  rotateGlobalApiKey();
                  toast.success("New Global API key generated!");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
                title="Regenerate this key"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Rotate</span>
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
            <span>Scope: <strong className="text-foreground">read:global_signals, write:paper_orders</strong></span>
            <span>CORS: <strong className="text-cyan-400">Access-Control-Allow-Origin: *</strong></span>
            <span>Created: <strong className="text-foreground">{settings.globalApiKeyCreated || "2026-10-22"}</strong></span>
            <span>Status: <strong className="text-cyan-400">200 OK Live Ready</strong></span>
          </div>
        </div>

        {/* cURL and Endpoint Guide */}
        <div className="mt-4 rounded-xl border border-border/50 bg-background/40 p-3.5 text-xs font-mono space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-cyan-400" /> Live Endpoint (Paper Trading Webpage Integration)
            </span>
            <span className="text-[11px] text-cyan-400">GET JSON</span>
          </div>
          <div className="overflow-x-auto text-muted-foreground select-all py-1">
            <span className="text-amber-400">curl</span> -H <span className="text-cyan-300">"x-api-key: {settings.globalApiKey || DEFAULT_GLOBAL_KEY}"</span> \<br/>
            &nbsp;&nbsp;https://www.investiqq.me/api/v1/global/signals?instrument=S%26P%20500
          </div>
        </div>
      </div>

      {/* SECTION: High-Profit Analyzed Trades (Dispatched by Market Timings) */}
      <div className="space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-surface/90 via-surface/70 to-primary/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                <Zap className="h-3.5 w-3.5" /> High-Profit Analyzed Trades Engine
              </span>
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                Technical Charts • Option Greeks • Geopolitics
              </span>
            </div>
            <h3 className="font-display text-xl font-bold text-foreground">
              Analyzed High-Profit Trades (Indian &amp; US Markets)
            </h3>
            <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
              Every trade is thoroughly calculated with <strong>F&amp;O Chart technicals</strong> (EMAs, VWAP, Support/Resistance), <strong>Option Greeks</strong> (Delta, Gamma, Theta decay, PCR, Max Pain), and <strong>Geo-political macro drivers</strong> (Crude oil, US 10Y Yields, DXY, Central Bank rate paths). Sent to your 2 API keys according to local market trading hours.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runLiveTest("AUTO_TRADE_NSE")}
              disabled={testingEndpoint === "AUTO_TRADE_NSE"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition shadow-sm"
              title="Deliver best Indian trade automatically without manual click"
            >
              <Zap className="h-3.5 w-3.5 text-emerald-400" /> Auto-Trade NSE (Hands-Free)
            </button>
            <button
              type="button"
              onClick={() => runLiveTest("AUTO_TRADE_GLOBAL")}
              disabled={testingEndpoint === "AUTO_TRADE_GLOBAL"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition shadow-sm"
              title="Deliver best US trade automatically without manual click"
            >
              <Zap className="h-3.5 w-3.5 text-cyan-400" /> Auto-Trade US (Hands-Free)
            </button>
            <button
              type="button"
              onClick={() => runLiveTest("FETCH_ALL_TRADES")}
              disabled={testingEndpoint === "FETCH_ALL_TRADES"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/80 px-3 py-2 text-xs font-medium hover:bg-accent transition"
            >
              {testingEndpoint === "FETCH_ALL_TRADES" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
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
              <strong>100% Hands-Free Automatic Trading Enabled:</strong> No manual clicks needed! Your external paper trading webpage calls <code className="font-mono bg-background/80 px-1 py-0.5 rounded text-emerald-200">GET /api/v1/trades/auto</code> with your API key to automatically receive and fill the best profit trades.
            </span>
          </div>
          <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
            CORS: Allowed (*)
          </span>
        </div>

        {/* 1. Indian NSE F&O High-Profit Trades */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                <Activity className="h-3.5 w-3.5" /> Indian Market Setups (1st Key • NSE F&amp;O)
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {indianTiming.regularHoursIST}
              </span>
            </div>
            <span className="rounded-full border border-border bg-background/50 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
              {indianTiming.statusText}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {indianTrades.map((t) => (
              <div
                key={t.tradeId}
                className="rounded-xl border border-border/80 bg-background/60 p-5 shadow-md hover:border-emerald-500/40 transition space-y-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold text-foreground">{t.symbol}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-extrabold ${t.optionType === "PE" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"}`}>
                        {t.contract}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground font-medium">{t.strategy}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                      R:R {t.riskRewardRatio}
                    </span>
                    <p className="mt-1 text-[11px] text-emerald-400 font-semibold">{t.expectedProfitPctT2} Expected Profit</p>
                  </div>
                </div>

                {/* Price targets grid */}
                <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 bg-background/80 p-2.5 text-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Entry Prem.</span>
                    <strong className="text-foreground">{t.currency}{t.entryPrice}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-rose-400 block">Stop Loss</span>
                    <strong className="text-rose-400">{t.currency}{t.stopLossPrice}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-emerald-400 block">Target 1</span>
                    <strong className="text-emerald-400">{t.currency}{t.target1}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-emerald-300 block">Target 2</span>
                    <strong className="text-emerald-300">{t.currency}{t.target2}</strong>
                  </div>
                </div>

                {/* Analysis Pills */}
                <div className="space-y-2 text-xs">
                  <div className="rounded-lg border border-border/40 bg-surface/50 p-2.5 space-y-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                      <Layers className="h-3 w-3 text-primary" /> F&amp;O Chart Technicals:
                    </span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t.chartTechnicals.keyObservation} (Pattern: {t.chartTechnicals.chartPattern})
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-border/40 bg-surface/40 p-2 space-y-0.5">
                      <span className="font-medium text-muted-foreground block">Option Greeks:</span>
                      <p className="text-foreground">Delta: <strong>{t.greeks.putDelta || t.greeks.callDelta}</strong> · Gamma: <strong>{t.greeks.gamma}</strong></p>
                      <p className="text-muted-foreground">Theta: <strong>{t.greeks.thetaPerDay}/day</strong> · PCR: <strong className="text-emerald-400">{t.greeks.pcrVolume}</strong></p>
                    </div>

                    <div className="rounded-lg border border-border/40 bg-surface/40 p-2 space-y-0.5">
                      <span className="font-medium text-muted-foreground block">Geopolitical / Macro:</span>
                      <p className="text-muted-foreground line-clamp-2">
                        {t.geopolitics.crudeOilImpact.slice(0, 75)}...
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    Timing: <strong>{t.timing.executionWindow}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => runLiveTest(t.symbol === "NIFTY 50" ? "DISPATCH_NIFTY" : "DISPATCH_BANKNIFTY")}
                    disabled={testingEndpoint?.includes("DISPATCH")}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition shadow-sm"
                  >
                    <Send className="h-3 w-3" /> Send to 1st Key
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. US Market High-Profit Trades */}
        <div className="space-y-3 pt-4 border-t border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-400">
                <Globe className="h-3.5 w-3.5" /> US &amp; Global Market Setups (2nd Key • GLOBAL)
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {globalTiming.regularHoursIST} ({globalTiming.regularHoursLocal})
              </span>
            </div>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
              {globalTiming.statusText}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {globalTrades.map((t) => (
              <div
                key={t.tradeId}
                className="rounded-xl border border-cyan-500/30 bg-background/60 p-5 shadow-md hover:border-cyan-500/50 transition space-y-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold text-foreground">{t.symbol}</span>
                      <span className="rounded px-2 py-0.5 text-xs font-extrabold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        {t.contract}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground font-medium">{t.strategy}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-bold text-cyan-400">
                      R:R {t.riskRewardRatio}
                    </span>
                    <p className="mt-1 text-[11px] text-cyan-400 font-semibold">{t.expectedProfitPctT2} Expected Profit</p>
                  </div>
                </div>

                {/* Price targets grid */}
                <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 bg-background/80 p-2.5 text-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Entry Prem.</span>
                    <strong className="text-foreground">{t.currency}{t.entryPrice}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-rose-400 block">Stop Loss</span>
                    <strong className="text-rose-400">{t.currency}{t.stopLossPrice}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-cyan-400 block">Target 1</span>
                    <strong className="text-cyan-400">{t.currency}{t.target1}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-cyan-300 block">Target 2</span>
                    <strong className="text-cyan-300">{t.currency}{t.target2}</strong>
                  </div>
                </div>

                {/* Analysis Pills */}
                <div className="space-y-2 text-xs">
                  <div className="rounded-lg border border-border/40 bg-surface/50 p-2.5 space-y-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                      <Layers className="h-3 w-3 text-cyan-400" /> Chart Technicals:
                    </span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t.chartTechnicals.keyObservation} (Pattern: {t.chartTechnicals.chartPattern})
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-border/40 bg-surface/40 p-2 space-y-0.5">
                      <span className="font-medium text-muted-foreground block">Option Greeks:</span>
                      <p className="text-foreground">Delta: <strong>{t.greeks.callDelta}</strong> · Gamma: <strong>{t.greeks.gamma}</strong></p>
                      <p className="text-muted-foreground">Theta: <strong>{t.greeks.thetaPerDay}/day</strong> · VIX: <strong className="text-cyan-400">14.8</strong></p>
                    </div>

                    <div className="rounded-lg border border-border/40 bg-surface/40 p-2 space-y-0.5">
                      <span className="font-medium text-muted-foreground block">Geopolitical / Macro:</span>
                      <p className="text-muted-foreground line-clamp-2">
                        {t.geopolitics.centralBankPolicyStance.slice(0, 75)}...
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="text-[11px] text-cyan-400 font-medium flex items-center gap-1">
                    <Zap className="h-3 w-3" /> US Session Live Timing
                  </span>
                  <button
                    type="button"
                    onClick={() => runLiveTest(t.symbol === "S&P 500" ? "DISPATCH_SPX" : "DISPATCH_NAS100")}
                    disabled={testingEndpoint?.includes("DISPATCH")}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition shadow-sm"
                  >
                    <Send className="h-3 w-3" /> Send to 2nd Key (Live)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 3: External Paper Trading Webpage Trade Execution */}
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
              Use your <strong>NSE F&amp;O Key</strong> or <strong>GLOBAL Key</strong> to take paper trades from your external application.
              Sends simulated order fill confirmations with instant order ID, execution price, and status. Full CORS support allows direct <code className="rounded bg-background/80 px-1 font-mono text-[11px]">fetch()</code> calls from browser webpages.
            </p>
          </div>

          <button
            type="button"
            onClick={() => runLiveTest("TRADE_ORDER")}
            disabled={testingEndpoint === "TRADE_ORDER"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition disabled:opacity-50"
          >
            {testingEndpoint === "TRADE_ORDER" ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            Simulate Paper Order
          </button>
        </div>

        {/* Code Example */}
        <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4 text-xs font-mono space-y-2">
          <div className="text-[11px] font-sans font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>JavaScript fetch example (Copy to your paper trading webpage):</span>
            <span className="text-purple-400">CORS Allowed (*)</span>
          </div>
          <pre className="overflow-x-auto text-muted-foreground leading-relaxed p-2 bg-background/90 rounded-lg select-all">
{`// Take a paper trade from your external webpage
const response = await fetch("https://www.investiqq.me/api/v1/trades/order", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "${settings.nseFnoApiKey || DEFAULT_NSE_FNO_KEY}" // Or Global key
  },
  body: JSON.stringify({
    symbol: "NIFTY 50",
    contract: "NIFTY50 22850 PE",
    action: "BUY",
    lots: 2,
    price: 137.5
  })
});
const order = await response.json();
console.log("Paper trade executed:", order);`}
          </pre>
        </div>
      </div>

      {/* SECTION 4: Live Interactive Response Console */}
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
                Immediate feedback confirming authorization and real data payloads.
              </p>
            </div>
          </div>

          {testResult && (
            <button
              onClick={() => setTestResult(null)}
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
              Click <strong>Test NSE Key</strong>, <strong>Test Global Key</strong>, or <strong>Simulate Paper Order</strong> above to view live API responses and verify both keys work.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => runLiveTest("NSE_FNO")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
              >
                <Activity className="h-3.5 w-3.5" /> Test NSE F&amp;O Key
              </button>
              <button
                type="button"
                onClick={() => runLiveTest("GLOBAL")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition"
              >
                <Globe className="h-3.5 w-3.5" /> Test Global Key
              </button>
              <button
                type="button"
                onClick={() => runLiveTest("TRADE_ORDER")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition"
              >
                <Terminal className="h-3.5 w-3.5" /> Simulate Paper Order
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------- Stocks -------- */
function StocksTab() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(DESKTOP_SYMBOLS.map((s) => [s, true])),
  );
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Stock Management</h3>
        <button
          onClick={() => toast.success("Stock data refreshed (mock)")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Exchange</th>
            <th>Sector</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {DESKTOP_SYMBOLS.map((s) => {
            const meta = STOCKS[s]!;
            return (
              <tr key={s}>
                <td className="font-mono">{s}.NS</td>
                <td>{meta.name}</td>
                <td>NSE</td>
                <td className="text-muted-foreground">{meta.sector}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      enabled[s]
                        ? "bg-success/15 text-success"
                        : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {enabled[s] ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => setEnabled((prev) => ({ ...prev, [s]: !prev[s] }))}
                    className="rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] hover:bg-accent"
                  >
                    Toggle
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------- Notifications -------- */
function NotificationsTab() {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Notifications Log</h3>
        <button
          onClick={() => toast.success("Exported to CSV (mock)")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Stock</th>
            <th>Content</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATIONS_LOG.map((n, i) => (
            <tr key={i}>
              <td className="font-mono text-xs">{n.ts}</td>
              <td>{n.type}</td>
              <td className="font-medium">{n.stock}</td>
              <td className="text-muted-foreground">{n.content}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    n.status === "Sent"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {n.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------- Users -------- */
function UsersTab() {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <h3 className="font-display text-lg font-semibold">User Management</h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Total users" v={USERS_MOCK.length.toString()} />
        <Stat label="Active today" v={USERS_MOCK.filter((u) => u.lastLogin === "2026-07-14").length.toString()} />
        <Stat label="Inactive" v={USERS_MOCK.filter((u) => !u.active).length.toString()} />
      </div>
      <table className="admin-table mt-6">
        <thead>
          <tr>
            <th>Name</th>
            <th>Registered</th>
            <th>Last login</th>
            <th>Holdings</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {USERS_MOCK.map((u) => (
            <tr key={u.name}>
              <td className="font-medium">{u.name}</td>
              <td className="text-muted-foreground">{u.regDate}</td>
              <td className="text-muted-foreground">{u.lastLogin}</td>
              <td>{u.holdings}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    u.active ? "bg-success/15 text-success" : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {u.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <button
                  onClick={() => toast.info(`Viewing ${u.name} (mock)`)}
                  className="rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] hover:bg-accent"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------- Shared bits -------- */
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3 text-sm">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-gradient-primary" : "bg-muted"}`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{v}</p>
    </div>
  );
}
