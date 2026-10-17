import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAdmin } from "@/context/AdminContext";
import { DESKTOP_SYMBOLS, NOTIFICATIONS_LOG, USERS_MOCK } from "@/lib/desktop-data";
import { STOCKS } from "@/lib/market-data";
import { readPublicSheet } from "@/lib/sheets.functions";
import { Send, RefreshCw, Copy, Trash2, Download, LogOut, Lock } from "lucide-react";

export const Route = createFileRoute("/desktop/admin")({
  component: AdminPanel,
});

type Tab =
  | "overview"
  | "telegram"
  | "sheets"
  | "apikeys"
  | "stocks"
  | "notifications"
  | "users";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "telegram", label: "Telegram" },
  { id: "sheets", label: "Google Sheets" },
  { id: "apikeys", label: "API Keys" },
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

      {tab === "overview" && <Overview />}
      {tab === "telegram" && <TelegramTab />}
      {tab === "sheets" && <SheetsTab />}
      {tab === "apikeys" && <ApiKeysTab />}
      {tab === "stocks" && <StocksTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}

/* -------- Overview -------- */
function Overview() {
  const stats = [
    { l: "Total users", v: USERS_MOCK.length.toString() },
    { l: "Active today", v: USERS_MOCK.filter((u) => u.lastLogin === "2026-07-14").length.toString() },
    { l: "Portfolio value", v: "₹18.7L" },
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
          {["Send test Telegram", "Refresh sheet data", "Generate API key", "Export notifications"].map((a) => (
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


  const chatIds = settings.telegramChatId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const sendTest = async () => {
    if (!settings.masterEnabled) {
      toast.error("Master toggle is OFF — enable it to send Telegram messages");
      return;
    }
    if (!settings.telegramBotToken || chatIds.length === 0) {
      toast.error("Bot token and Chat ID are required");
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

      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="Bot token">
          <input
            value={settings.telegramBotToken}
            onChange={(e) => updateSettings({ telegramBotToken: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Chat IDs (permanent — comma-separated)">
          <input
            value={settings.telegramChatId}
            readOnly
            title="Permanent chat IDs — locked"
            className="admin-input cursor-not-allowed opacity-90"
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Locked recipients: <code>7350570004</code>, <code>5589831995</code>, <code>1840901163</code>, <code>1360613728</code>, <code>8155139346</code>, <code>6799336293</code>, <code>7280324188</code>. Every alert is
        delivered to all IDs above and cannot be removed from the UI.
      </p>
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
              const res = await fetch("/api/public/hooks/rsi-alert", { method: "POST" });
              const json = (await res.json()) as { ok: boolean; sent?: number; error?: string };
              if (json.ok) toast.success(`RSI alert sent — ${json.sent} ETFs`);
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
              const res = await fetch("/api/public/hooks/premarket-alert", { method: "POST" });
              const j = (await res.json()) as { ok: boolean; delivered?: number; gainers?: number; error?: string };
              if (j.ok) toast.success(`Pre-market alert sent — ${j.gainers} gainers to ${j.delivered} chat(s)`);
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
                body: JSON.stringify({ section: "all" }),
              });
              const j = (await res.json()) as { ok: boolean; delivered?: number; scanned?: number; error?: string };
              if (j.ok) toast.success(`Post-market alert sent — ${j.scanned} stocks scanned, ${j.delivered} chat(s)`);
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
              const res = await fetch("/api/public/hooks/ipo-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
              const j = (await res.json()) as { ok: boolean; delivered?: number; sent?: number; error?: string };
              if (j.ok) toast.success(`IPO alert sent — ${j.sent} IPOs to ${j.delivered} chat delivery(ies)`);
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
              const res = await fetch("/api/public/hooks/funds-alert", { method: "POST" });
              const j = (await res.json()) as { ok: boolean; delivered?: number; categories?: string[]; error?: string };
              if (j.ok) toast.success(`Fund digest sent — ${j.categories?.length ?? 0} categories, ${j.delivered} deliveries`);
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
                  body: JSON.stringify({ symbol: fnoSymbol }),
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
  const { settings, regenerateApiKey } = useAdmin();
  const masked = settings.apiKey.slice(0, 14) + "•••••••••••" + settings.apiKey.slice(-4);
  const fnoMasked =
    settings.fnoEngineApiKey.slice(0, 6) + "••••••••••••••••••••" + settings.fnoEngineApiKey.slice(-6);
  return (
    <div className="space-y-6">
      {/* Existing webpage API key — untouched */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6">
        <h3 className="font-display text-lg font-semibold">Webpage API Key</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Existing key used by the InvestIQ website — leave as-is unless rotating.
        </p>
        <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Current key</p>
              <p className="mt-1 font-mono text-sm">{masked}</p>
            </div>
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs text-success">Active</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <p>Created: {settings.apiKeyCreated}</p>
            <p>Last used: {settings.apiKeyLastUsed}</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(settings.apiKey).catch(() => {});
                toast.success("API key copied");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              onClick={() => {
                regenerateApiKey();
                toast.success("New API key generated");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </button>
            <button
              onClick={() => toast.error("Key revoke is a destructive action (mock)")}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Revoke
            </button>
          </div>
        </div>
      </div>

      {/* NEW: F&O Trading Engine API Key */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">F&amp;O Trading Engine API Key</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Separate key for the F&amp;O signal engine (India + USA). Stored server-side in the
              secrets manager as <code className="rounded bg-background/60 px-1">FNO_ENGINE_API_KEY</code> —
              never bundled into the frontend.
            </p>
          </div>
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            Server-managed
          </span>
        </div>
        <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                F&amp;O engine key (masked)
              </p>
              <p className="mt-1 font-mono text-sm">{fnoMasked}</p>
            </div>
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs text-success">Active</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <p>Created: {settings.fnoEngineApiKeyCreated}</p>
            <p>Storage: Encrypted env var (workspace secrets)</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() =>
                toast.info(
                  "F&O engine key is stored server-side. To rotate, use the secrets manager — the new value is never returned to the browser.",
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Rotate (server-side)
            </button>
          </div>
        </div>
      </div>

      <OptionChainKeyCard />
    </div>
  );
}

/* -------- Option Chain API key management -------- */
function OptionChainKeyCard() {
  const {
    settings,
    regenerateOcApiKey,
    revokeOcApiKey,
    setOcUserEnabled,
    setOcUserLevel,
    removeOcUser,
  } = useAdmin();
  const [reveal, setReveal] = useState(false);
  const [confirm, setConfirm] = useState<null | "generate" | "revoke">(null);
  const [busy, setBusy] = useState(false);

  const key = settings.ocApiKey;
  const masked = "•".repeat(Math.max(0, key.length - 4)) + key.slice(-4);
  const status = settings.ocApiKeyStatus;
  const activeUsers = settings.ocUsers.filter((u) => u.enabled);
  const statusStyle =
    status === "active"
      ? "bg-success/15 text-success"
      : status === "revoked"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";

  const copy = () => {
    navigator.clipboard.writeText(key).catch(() => {});
    toast.success("API Key copied to clipboard");
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Option Chain API Key</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Key used for option-chain data access. Full lifecycle: copy, generate, revoke and
            per-user access control.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyle}`}>
          {status}
        </span>
      </div>

      <div
        className="mt-5 rounded-xl border border-border bg-background/40 p-4"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            copy();
          }
        }}
      >
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Current key</p>
        <div className="mt-1 flex items-center gap-3">
          <p className="font-mono text-sm break-all">{reveal ? key : masked}</p>
          <button
            onClick={() => setReveal((v) => !v)}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted-foreground md:grid-cols-4">
          <p>Created: {settings.ocApiKeyCreated}</p>
          <p>Last used: {settings.ocApiKeyLastUsed}</p>
          <p>Expires: {settings.ocApiKeyExpires}</p>
          <p>Rate limit: 1,000 req/min</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button
            onClick={() => setConfirm("generate")}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Generate New API Key
          </button>
          {status === "active" && (
            <button
              onClick={() => setConfirm("revoke")}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Revoke Key
            </button>
          )}
        </div>
        {status === "revoked" && (
          <p className="mt-3 text-xs text-destructive">
            This key is revoked — all option-chain access is disabled. Generate a new key to restore
            access.
          </p>
        )}
      </div>

      {/* Users with access */}
      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Users with access ({activeUsers.length}/{settings.ocUsers.length} enabled)
        </p>
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
                      disabled={status !== "active"}
                      onClick={() => {
                        setOcUserEnabled(u.id, !u.enabled);
                        toast.success(
                          `Access for ${u.name} has been ${u.enabled ? "Disabled" : "Enabled"}`,
                        );
                      }}
                      className={`relative h-6 w-11 rounded-full transition-colors duration-300 disabled:opacity-40 ${
                        u.enabled ? "bg-gradient-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all duration-300 ${
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
              {!settings.ocUsers.length && (
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

      {/* Audit log */}
      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Audit log
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {settings.ocAudit.map((a, i) => (
            <li key={i} className="rounded border border-border bg-background/40 px-3 py-2">
              <span className="font-mono">{a.at}</span> — {a.event}
            </li>
          ))}
        </ul>
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
            <h4 className="font-display text-base font-semibold">
              {confirm === "generate" ? "Generate new API key?" : "Revoke this API key?"}
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirm === "generate"
                ? "Generating a new API key will invalidate the current one."
                : "Revoking this key will immediately disable all access for users."}
            </p>
            {confirm === "revoke" && (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {activeUsers.map((u) => (
                  <li key={u.id}>• {u.name} ({u.email})</li>
                ))}
                {!activeUsers.length && <li>• No users currently have active access.</li>}
              </ul>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  const mode = confirm;
                  setTimeout(() => {
                    if (mode === "generate") {
                      const fresh = regenerateOcApiKey();
                      setReveal(true);
                      toast.success("New API key generated", {
                        action: {
                          label: "Copy",
                          onClick: () => {
                            navigator.clipboard.writeText(fresh).catch(() => {});
                            toast.success("API Key copied to clipboard");
                          },
                        },
                      });
                    } else {
                      revokeOcApiKey();
                      toast.success("API Key successfully revoked");
                    }
                    setBusy(false);
                    setConfirm(null);
                  }, 400);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  confirm === "revoke"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-gradient-primary text-primary-foreground shadow-glow"
                } disabled:opacity-50`}
              >
                {busy ? "Working…" : "Confirm"}
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
