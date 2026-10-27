import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { PERMANENT_CHAT_IDS } from "./admin-constants";
import { Field, Toggle } from "./shared";

type AlertResponse = {
  ok: boolean;
  error?: string;
  sent?: number;
  delivered?: number;
  gainers?: number;
  scanned?: number;
  categories?: string[];
};

interface AlertAction {
  label: string;
  endpoint: string;
  body: (chatIds: string[]) => Record<string, unknown>;
  success: (j: AlertResponse, chatIds: string[]) => string;
  /** Prefix used for the failure toast. */
  failPrefix: string;
}

const ALERT_ACTIONS: AlertAction[] = [
  {
    label: "Send RSI alert now",
    endpoint: "/api/public/hooks/rsi-alert",
    body: (chatIds) => ({ chatIds }),
    success: (j, chatIds) => `RSI alert sent — ${j.sent} ETFs to ${chatIds.length} chat(s)`,
    failPrefix: "Alert failed",
  },
  {
    label: "Send Pre-market now",
    endpoint: "/api/public/hooks/premarket-alert",
    body: (chatIds) => ({ chatIds }),
    success: (j, chatIds) =>
      `Pre-market alert sent — ${j.gainers} gainers to ${j.delivered ?? chatIds.length} chat(s)`,
    failPrefix: "Alert failed",
  },
  {
    label: "Send Post-market now",
    endpoint: "/api/public/hooks/postmarket-alert",
    body: (chatIds) => ({ section: "all", chatIds }),
    success: (j, chatIds) =>
      `Post-market alert sent — ${j.scanned} stocks scanned, ${j.delivered ?? chatIds.length} chat(s)`,
    failPrefix: "Alert failed",
  },
  {
    label: "Send IPO alert now",
    endpoint: "/api/public/hooks/ipo-alert",
    body: (chatIds) => ({ force: true, chatIds }),
    success: (j, chatIds) =>
      `IPO alert sent — ${j.sent} IPOs to ${j.delivered ?? chatIds.length} chat delivery(ies)`,
    failPrefix: "Alert failed",
  },
  {
    label: "Send Fund digest now",
    endpoint: "/api/public/hooks/funds-alert",
    body: (chatIds) => ({ chatIds }),
    success: (j, chatIds) =>
      `Fund digest sent — ${j.categories?.length ?? 0} categories, ${j.delivered ?? chatIds.length} deliveries`,
    failPrefix: "Alert failed",
  },
];

const ALERT_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50";

export function TelegramSection() {
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

  const runAlert = async (action: AlertAction) => {
    setSending(true);
    try {
      const res = await fetch(action.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body(chatIds)),
      });
      const json = (await res.json()) as AlertResponse;
      if (json.ok) toast.success(action.success(json, chatIds));
      else toast.error(`${action.failPrefix}: ${json.error ?? "unknown"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendFnoAlert = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/fno-alert", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: fnoSymbol, chatIds }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        trades?: number;
        notified?: { sent: number; total: number };
        error?: string;
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
  };

  const master = settings.masterEnabled;

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <h3 className="font-display text-lg font-semibold">Telegram Settings</h3>

      {/* MASTER TOGGLE */}
      <div
        className={`mt-5 rounded-xl border p-4 ${
          master ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-sm font-semibold">🤖 Master Telegram bot control</p>
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
        <Field label="Bot token (this session only — not saved)">
          <input
            value={settings.telegramBotToken}
            onChange={(e) => updateSettings({ telegramBotToken: e.target.value })}
            placeholder="123456789:AA… (paste your bot token; kept in memory only)"
            autoComplete="off"
            spellCheck={false}
            className="admin-input"
          />
        </Field>
        <Field
          label={`Chat IDs (${chatIds.length} configured recipient${chatIds.length === 1 ? "" : "s"} — editable)`}
        >
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
              You have full manual edit access. Type or paste comma-separated IDs in the field
              above, or manage them below.
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
              ⚠️ No chat IDs configured. Enter at least one Telegram Chat ID to receive outbound
              alerts.
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
        {ALERT_ACTIONS.map((action) => (
          <button
            key={action.endpoint}
            disabled={sending || !master}
            onClick={() => runAlert(action)}
            className={ALERT_BUTTON_CLASS}
          >
            <Send className="h-4 w-4" /> {action.label}
          </button>
        ))}
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
            onClick={sendFnoAlert}
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
        Auto-dispatch (only when Master is ON): RSI <b>11:45 AM · Mon–Fri</b> · Pre-market{" "}
        <b>9:00 AM · Mon–Fri</b> · Post-market summary/sectors/trending{" "}
        <b>4:15 / 4:30 / 4:45 PM · Mon–Fri</b> · IPO check <b>9:30 AM &amp; 1:30 PM</b> (only when a
        NEW IPO is detected — no re-sends) · News <b>every 10 min during market hours</b> · Mutual
        Funds <b>Monday 9:30 AM only</b> · Quarterly reports — event-based (manual/announcement
        only).
      </p>
    </div>
  );
}
