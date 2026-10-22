import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAdmin, PERMANENT_CHAT_IDS, type CustomApiKey } from "@/context/AdminContext";
import { DESKTOP_SYMBOLS, NOTIFICATIONS_LOG, USERS_MOCK } from "@/lib/desktop-data";
import { STOCKS } from "@/lib/market-data";
import { readPublicSheet } from "@/lib/sheets.functions";
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
    settings.apiKey,
    settings.fnoEngineApiKey,
    settings.growwApiKey,
    settings.ocApiKey,
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
    deleteAllApiKeys,
    setWebpageApiKey,
    deleteWebpageApiKey,
    setFnoEngineApiKey,
    deleteFnoEngineApiKey,
    setGrowwCredentials,
    deleteGrowwCredentials,
    setOcApiKey,
    deleteOcApiKey,
    setOcUserLevel,
    setOcUserEnabled,
    removeOcUser,
    addOcUser,
  } = useAdmin();

  const [activeModal, setActiveModal] = useState<
    "deleteAll" | "webpage" | "fno" | "groww" | "optionChain" | "addUser" | null
  >(null);

  const [deleteAllInput, setDeleteAllInput] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form inputs
  const [webKeyInput, setWebKeyInput] = useState("");
  const [fnoKeyInput, setFnoKeyInput] = useState("");
  const [growwApiKeyInput, setGrowwApiKeyInput] = useState("");
  const [growwSecretInput, setGrowwSecretInput] = useState("");
  const [ocKeyInput, setOcKeyInput] = useState("");
  const [ocExpiresInput, setOcExpiresInput] = useState("Never");
  const [userNameInput, setUserNameInput] = useState("");
  const [userEmailInput, setUserEmailInput] = useState("");
  const [userLevelInput, setUserLevelInput] = useState<"Read-only" | "Read-Write" | "Full Access">("Read-only");

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
    return `${str.slice(0, 6)}${"•".repeat(Math.max(8, str.length - 10))}${str.slice(-4)}`;
  };

  const activeUsers = (settings.ocUsers || []).filter((u) => u.enabled);

  return (
    <div className="space-y-6">
      {/* Top Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface/60 p-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">API Key Management</h3>
            <span className="rounded-full border border-border bg-background/50 px-2.5 py-0.5 text-xs text-muted-foreground">
              4 Core Sections
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Configure and manage API keys for Webpage access, F&amp;O Trading Engine, Groww broker credentials, and Option Chain feeds.
          </p>
        </div>
        <button
          onClick={() => {
            setDeleteAllInput("");
            setActiveModal("deleteAll");
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition shadow-sm"
        >
          <Trash2 className="h-4 w-4" /> Delete all API keys
        </button>
      </div>

      {/* SECTION 1: Webpage API Key */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Webpage API Key</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              API key used by external clients to access market feeds and trading data via HTTP headers (<code className="rounded bg-background/60 px-1 font-mono text-[11px]">x-api-key</code>).
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              settings.apiKey
                ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                : "border border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            {settings.apiKey ? "Configured" : "Not Configured"}
          </span>
        </div>

        {!settings.apiKey ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/30 p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground">
              <Key className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">No API key configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              All client requests without authorization will receive a clean "API key not configured" response.
            </p>
            <button
              onClick={() => {
                setWebKeyInput("");
                setActiveModal("webpage");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-95 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add API key
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-xs select-all text-foreground">
                {revealed["webpage"] ? settings.apiKey : maskKeyStr(settings.apiKey)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevealed((p) => ({ ...p, webpage: !p.webpage }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition"
                >
                  {revealed["webpage"] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{revealed["webpage"] ? "Hide" : "Show"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(settings.apiKey, "webpage")}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
                >
                  {copiedKey === "webpage" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === "webpage" ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteWebpageApiKey();
                    toast.success("Webpage API key removed");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-background/50 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/15 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t border-border/50 pt-2">
              <span>Created: {settings.apiKeyCreated || "Recent"}</span>
              <span>Last used: {settings.apiKeyLastUsed || "Active"}</span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: F&O Trading Engine API Key */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">F&amp;O Trading Engine API Key</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Separate key for the F&amp;O signal engine (India + USA). Stored server-side in the secrets manager as{" "}
              <code className="rounded bg-background/60 px-1 font-mono text-[11px]">FNO_ENGINE_API_KEY</code> — never bundled into the frontend.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              settings.fnoEngineApiKey
                ? "border border-amber-500/30 bg-amber-500/15 text-amber-400"
                : "border border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            {settings.fnoEngineApiKey ? "Server-managed" : "Not Configured"}
          </span>
        </div>

        {!settings.fnoEngineApiKey ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/30 p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground">
              <Key className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">No API key configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              F&amp;O continuous signal engine is unconfigured. Dependent signal streams show a graceful "API key not configured" state.
            </p>
            <button
              onClick={() => {
                setFnoKeyInput("");
                setActiveModal("fno");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-95 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add API key
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">F&amp;O Engine Key (Masked)</p>
                <p className="mt-1 font-mono text-xs text-foreground select-all">
                  {revealed["fno"] ? settings.fnoEngineApiKey : maskKeyStr(settings.fnoEngineApiKey)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevealed((p) => ({ ...p, fno: !p.fno }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition"
                >
                  {revealed["fno"] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{revealed["fno"] ? "Hide" : "Show"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(settings.fnoEngineApiKey, "fno")}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
                >
                  {copiedKey === "fno" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === "fno" ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteFnoEngineApiKey();
                    toast.success("F&O Engine API key removed");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-background/50 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/15 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2">
              <span>Created: {settings.fnoEngineApiKeyCreated || "Recent"}</span>
              <span>Storage: Encrypted env var (workspace secrets)</span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Groww Trading API */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <span>Groww Trading API</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  settings.growwApiKey
                    ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                    : "border border-border bg-muted/40 text-muted-foreground"
                }`}
              >
                {settings.growwApiKey ? "Connected" : "Disconnected"}
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Official Groww Trade API integration credentials (<code className="rounded bg-background/60 px-1 font-mono text-[11px]">GROWW_API_KEY</code> &amp; <code className="rounded bg-background/60 px-1 font-mono text-[11px]">GROWW_API_SECRET</code>).
            </p>
          </div>
          {settings.growwApiKey && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              Session: {settings.growwSession || "Investiq"}
            </span>
          )}
        </div>

        {!settings.growwApiKey ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/30 p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground">
              <Key className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">No API key configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Session disconnected • No cached tokens, sessions, or synced holdings. Dependent portfolio features show a clean "API key not configured" state.
            </p>
            <button
              onClick={() => {
                setGrowwApiKeyInput("");
                setGrowwSecretInput("");
                setActiveModal("groww");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-95 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add API key
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Groww API Token (Masked)</p>
                <p className="mt-1 font-mono text-xs text-foreground select-all">
                  {maskKeyStr(settings.growwApiKey)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  deleteGrowwCredentials();
                  toast.success("Groww credentials removed permanently");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-background/50 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/15 transition"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete credentials
              </button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground border-t border-border/50 pt-2">
              Storage: Encrypted server environment (GROWW_API_KEY &amp; SECRET)
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: Option Chain API Key */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Option Chain API Key</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Dedicated key for option chain data feeds, Greeks ingestion, and strike updates.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              settings.ocApiKey
                ? "border border-blue-500/30 bg-blue-500/15 text-blue-400"
                : "border border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            {settings.ocApiKey ? "Active" : "Not Configured"}
          </span>
        </div>

        {!settings.ocApiKey ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/30 p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground">
              <Key className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">No API key configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              No option chain key is currently registered. External option chain requests return a clean "API key not configured" message.
            </p>
            <button
              onClick={() => {
                setOcKeyInput("");
                setActiveModal("optionChain");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-95 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add API key
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-xs select-all text-foreground">
                {revealed["optionChain"] ? settings.ocApiKey : maskKeyStr(settings.ocApiKey)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevealed((p) => ({ ...p, optionChain: !p.optionChain }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition"
                >
                  {revealed["optionChain"] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{revealed["optionChain"] ? "Hide" : "Show"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(settings.ocApiKey, "optionChain")}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
                >
                  {copiedKey === "optionChain" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === "optionChain" ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteOcApiKey();
                    toast.success("Option Chain API key removed");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-background/50 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/15 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t border-border/50 pt-2">
              <span>Created: {settings.ocApiKeyCreated || "Recent"}</span>
              <span>Expires: {settings.ocApiKeyExpires || "Never"}</span>
            </div>
          </div>
        )}

        {/* Users with access */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Users with access ({activeUsers.length}/{settings.ocUsers.length} enabled)
            </p>
            {settings.ocApiKey && (
              <button
                onClick={() => {
                  setUserNameInput("");
                  setUserEmailInput("");
                  setUserLevelInput("Read-only");
                  setActiveModal("addUser");
                }}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add user
              </button>
            )}
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-background/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Access level</th>
                  <th className="px-4 py-2 text-left">Access</th>
                  <th className="px-4 py-2 text-left">Last activity</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {settings.ocUsers.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <p>{u.name}</p>
                      <p className="text-[11px] text-muted-foreground">{u.id}</p>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2">
                      <select
                        value={u.level}
                        onChange={(e) => {
                          setOcUserLevel(u.id, e.target.value as typeof u.level);
                          toast.success(`${u.name} set to ${e.target.value}`);
                        }}
                        className="admin-input py-1 text-xs"
                      >
                        <option value="Read-only">Read-only</option>
                        <option value="Read-Write">Read-Write</option>
                        <option value="Full Access">Full Access</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        aria-pressed={u.enabled}
                        aria-label={`Toggle access for ${u.name}`}
                        onClick={() => {
                          setOcUserEnabled(u.id, !u.enabled);
                          toast.success(`Access for ${u.name} ${u.enabled ? "Disabled" : "Enabled"}`);
                        }}
                        className={`relative h-6 w-11 rounded-full transition ${
                          u.enabled ? "bg-gradient-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition ${
                            u.enabled ? "left-5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{u.lastActivity}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          removeOcUser(u.id);
                          toast.success(`${u.name} removed`);
                        }}
                        className="rounded border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {settings.ocUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      No users have access to this key.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 5: Audit Log */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Audit log</h3>
          <span className="text-xs text-muted-foreground">
            {settings.ocAudit.length} {settings.ocAudit.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
          {settings.ocAudit.map((a, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3.5 py-2.5"
            >
              <span className="font-mono text-foreground shrink-0">{a.at}</span>
              <span>—</span>
              <span
                className={
                  a.event.includes("deleted")
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                }
              >
                {a.event}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* MODAL: Delete All API Keys Confirmation */}
      {activeModal === "deleteAll" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-surface p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-destructive">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h4 className="font-display text-base font-semibold text-foreground">
                  Permanently Delete ALL API Keys?
                </h4>
                <p className="text-xs text-muted-foreground">Hard delete action</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              This is a permanent hard delete, not a soft-delete or revocation. All four sections (Webpage, F&amp;O Trading Engine, Groww credentials, and Option Chain), all user access entries, and cached sessions will be wiped. Nothing will be regenerated.
            </p>

            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
              To confirm this hard delete, please type{" "}
              <strong className="font-mono text-destructive">DELETE ALL</strong> below:
            </div>

            <input
              type="text"
              value={deleteAllInput}
              onChange={(e) => setDeleteAllInput(e.target.value)}
              placeholder="Type DELETE ALL to confirm"
              className="admin-input mt-3 font-mono text-xs uppercase"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium hover:bg-accent transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteAllInput !== "DELETE ALL"}
                onClick={() => {
                  deleteAllApiKeys();
                  setActiveModal(null);
                  toast.success("All API keys permanently deleted");
                }}
                className="rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground disabled:opacity-40 transition"
              >
                Permanently Delete All Keys
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Webpage API Key */}
      {activeModal === "webpage" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-display text-base font-semibold">Add Webpage API Key</h4>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="API Key Value">
                <input
                  type="text"
                  value={webKeyInput}
                  onChange={(e) => setWebKeyInput(e.target.value)}
                  placeholder="Paste key or leave empty to auto-generate"
                  className="admin-input font-mono text-xs"
                  autoFocus
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = webKeyInput.trim() || `iq_web_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
                  setWebpageApiKey(val);
                  setActiveModal(null);
                  toast.success("Webpage API key saved");
                }}
                className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow"
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add F&O Engine API Key */}
      {activeModal === "fno" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-display text-base font-semibold">Add F&amp;O Engine API Key</h4>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="FNO Engine Secret Key">
                <input
                  type="text"
                  value={fnoKeyInput}
                  onChange={(e) => setFnoKeyInput(e.target.value)}
                  placeholder="Paste FNO engine secret key"
                  className="admin-input font-mono text-xs"
                  autoFocus
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = fnoKeyInput.trim() || `iq_fno_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
                  setFnoEngineApiKey(val);
                  setActiveModal(null);
                  toast.success("F&O Engine API key saved");
                }}
                className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow"
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Groww API Credentials */}
      {activeModal === "groww" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-display text-base font-semibold">Add Groww API Credentials</h4>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="GROWW_API_KEY (Token / Key)">
                <input
                  type="text"
                  value={growwApiKeyInput}
                  onChange={(e) => setGrowwApiKeyInput(e.target.value)}
                  placeholder="Paste Groww API token"
                  className="admin-input font-mono text-xs"
                  autoFocus
                  required
                />
              </Field>
              <Field label="GROWW_API_SECRET">
                <input
                  type="password"
                  value={growwSecretInput}
                  onChange={(e) => setGrowwSecretInput(e.target.value)}
                  placeholder="Paste Groww API secret"
                  className="admin-input font-mono text-xs"
                  required
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                disabled={!growwApiKeyInput.trim() || !growwSecretInput.trim()}
                onClick={() => {
                  setGrowwCredentials(growwApiKeyInput.trim(), growwSecretInput.trim());
                  setActiveModal(null);
                  toast.success("Groww credentials configured");
                }}
                className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-40"
              >
                Save Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Option Chain API Key */}
      {activeModal === "optionChain" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-display text-base font-semibold">Add Option Chain API Key</h4>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="Option Chain Key">
                <input
                  type="text"
                  value={ocKeyInput}
                  onChange={(e) => setOcKeyInput(e.target.value)}
                  placeholder="Paste key or leave empty to auto-generate"
                  className="admin-input font-mono text-xs"
                  autoFocus
                />
              </Field>
              <Field label="Expiration">
                <select
                  value={ocExpiresInput}
                  onChange={(e) => setOcExpiresInput(e.target.value)}
                  className="admin-input"
                >
                  <option value="Never">Never (Permanent)</option>
                  <option value="30 Days">30 Days</option>
                  <option value="90 Days">90 Days</option>
                  <option value="1 Year">1 Year</option>
                </select>
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = ocKeyInput.trim() || `iq_oc_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
                  setOcApiKey(val, ocExpiresInput);
                  setActiveModal(null);
                  toast.success("Option Chain API key saved");
                }}
                className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow"
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add User to Option Chain */}
      {activeModal === "addUser" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-display text-base font-semibold">Grant Option Chain Access</h4>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="User Name">
                <input
                  type="text"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  placeholder="e.g. Risk Desk Analyst"
                  className="admin-input"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Email Address">
                <input
                  type="email"
                  value={userEmailInput}
                  onChange={(e) => setUserEmailInput(e.target.value)}
                  placeholder="e.g. analyst@investiq.in"
                  className="admin-input"
                  required
                />
              </Field>
              <Field label="Access Level">
                <select
                  value={userLevelInput}
                  onChange={(e) => setUserLevelInput(e.target.value as typeof userLevelInput)}
                  className="admin-input"
                >
                  <option value="Read-only">Read-only</option>
                  <option value="Read-Write">Read-Write</option>
                  <option value="Full Access">Full Access</option>
                </select>
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                disabled={!userNameInput.trim() || !userEmailInput.trim()}
                onClick={() => {
                  addOcUser({
                    name: userNameInput.trim(),
                    email: userEmailInput.trim(),
                    level: userLevelInput,
                    enabled: true,
                  });
                  setActiveModal(null);
                  toast.success(`Access granted to ${userNameInput}`);
                }}
                className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-40"
              >
                Grant Access
              </button>
            </div>
          </div>
        </div>
      )}
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
