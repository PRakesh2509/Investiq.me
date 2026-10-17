import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type OcAccessLevel = "Read-only" | "Read-Write" | "Full Access";

export interface OcUser {
  id: string;
  name: string;
  email: string;
  level: OcAccessLevel;
  enabled: boolean;
  lastActivity: string;
}

export interface OcAuditEntry {
  at: string;
  event: string;
}

interface AdminSettings {
  masterEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  notifyNews: boolean;
  notifyQuarterly: boolean;
  notifyRSI: boolean;
  notifyPreMarket: boolean;
  notifyPostMarket: boolean;
  notifyIpo: boolean;
  notifyFunds: boolean;
  notifyFnoIndia: boolean;
  notifyFnoUsa: boolean;
  sheetUrl: string;
  sheetName: string;
  colName: string;
  colRSI: string;
  colPrice: string;
  apiKey: string;
  apiKeyCreated: string;
  apiKeyLastUsed: string;
  fnoEngineApiKey: string;
  fnoEngineApiKeyCreated: string;
  // Option Chain API key lifecycle
  ocApiKey: string;
  ocApiKeyStatus: "active" | "revoked" | "expired";
  ocApiKeyCreated: string;
  ocApiKeyLastUsed: string;
  ocApiKeyExpires: string;
  ocUsers: OcUser[];
  ocAudit: OcAuditEntry[];
  // Option Chain Telegram alerts
  notifyOptionChain: boolean;
  ocFrequency: "Real-time" | "5-min" | "15-min" | "Hourly";
  ocThreshold: number;
  ocStrikeFilter: string;
  ocGreeksAlerts: boolean;
  ocVolumeAlerts: boolean;
}


// Permanent Telegram chat IDs — do not remove. Always included in outbound alerts.
export const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"] as const;

const defaultSettings: AdminSettings = {
  masterEnabled: true,
  telegramBotToken: "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc",
  telegramChatId: PERMANENT_CHAT_IDS.join(","),
  notifyNews: true,
  notifyQuarterly: true,
  notifyRSI: true,
  notifyPreMarket: true,
  notifyPostMarket: true,
  notifyIpo: true,
  notifyFunds: true,
  notifyFnoIndia: false,
  notifyFnoUsa: false,
  sheetUrl:
    "https://docs.google.com/spreadsheets/d/1WgMLvMlUewkeljWkwFH6Cmcryytn8cWgIXgsmlq1Syo/edit?usp=sharing",
  sheetName: "Sheet1",
  colName: "C",
  colRSI: "B",
  colPrice: "A",
  apiKey: "invest_iq_demo_8f3a9c1d5e7b2a4f6g8h0j",
  apiKeyCreated: "2026-06-01",
  apiKeyLastUsed: "2026-07-14",
  // Display-only reference to the securely stored server secret FNO_ENGINE_API_KEY.
  // The actual value lives in the server secrets manager and is never sent to the browser.
  fnoEngineApiKey: "aB7xP9mQ2nL5kR8tV1yH6cW3eF4gJ0zN",
  fnoEngineApiKeyCreated: "2026-07-28",
  // Option Chain data API key (dummy/demo value supplied by the admin).
  ocApiKey: "aB7xK9mP2qR8vN4tY6wL1cD5eF3hJ0zQ",
  ocApiKeyStatus: "active",
  ocApiKeyCreated: "2026-08-05",
  ocApiKeyLastUsed: "2026-08-05",
  ocApiKeyExpires: "2026-11-03",
  ocUsers: [
    { id: "u-1001", name: "Prakesh R", email: "prakesh@investiq.in", level: "Full Access", enabled: true, lastActivity: "2026-08-05 12:48" },
    { id: "u-1002", name: "Desk Analyst", email: "analyst@investiq.in", level: "Read-Write", enabled: true, lastActivity: "2026-08-05 12:20" },
    { id: "u-1003", name: "Risk Viewer", email: "risk@investiq.in", level: "Read-only", enabled: false, lastActivity: "2026-08-03 15:05" },
  ],
  ocAudit: [{ at: "2026-08-05 12:00", event: "Option Chain API key registered (active)" }],
  notifyOptionChain: true,
  ocFrequency: "15-min",
  ocThreshold: 5,
  ocStrikeFilter: "ATM ±5",
  ocGreeksAlerts: true,
  ocVolumeAlerts: true,
};


/** Current IST timestamp, `YYYY-MM-DD HH:mm`. */
function stamp() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function withPermanentChatIds(chatId: string): string {
  // Only permanent IDs are allowed; any other saved IDs are dropped so
  // rotating the permanent list actually removes the old recipient.
  const wanted = new Set<string>(PERMANENT_CHAT_IDS);
  const existing = chatId
    .split(",")
    .map((s) => s.trim())
    .filter((s) => wanted.has(s));
  const set = new Set(existing);
  for (const id of PERMANENT_CHAT_IDS) set.add(id);
  return Array.from(set).join(",");
}

interface AdminCtx {
  isAdmin: boolean;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  settings: AdminSettings;
  updateSettings: (patch: Partial<AdminSettings>) => void;
  regenerateApiKey: () => void;
  regenerateOcApiKey: () => string;
  revokeOcApiKey: () => void;
  setOcUserEnabled: (id: string, enabled: boolean) => void;
  setOcUserLevel: (id: string, level: OcAccessLevel) => void;
  removeOcUser: (id: string) => void;

}

const Ctx = createContext<AdminCtx | null>(null);
const KEY = "investiq_admin_v1";
const SETTINGS_KEY = "investiq_admin_settings_v1";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);

  useEffect(() => {
    try {
      setIsAdmin(localStorage.getItem(KEY) === "1");
      const raw = localStorage.getItem(SETTINGS_KEY);
      const merged = raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
      merged.telegramChatId = withPermanentChatIds(merged.telegramChatId ?? "");
      setSettings(merged);
    } catch {}
  }, []);

  const persist = (s: AdminSettings) => {
    const next = { ...s, telegramChatId: withPermanentChatIds(s.telegramChatId ?? "") };
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <Ctx.Provider
      value={{
        isAdmin,
        login: (u, p) => {
          const ok = u === "prakesh25" && p === "Rakesh@25";
          if (ok) {
            setIsAdmin(true);
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
          }
          return ok;
        },
        logout: () => {
          setIsAdmin(false);
          try {
            localStorage.removeItem(KEY);
          } catch {}
        },
        settings,
        updateSettings: (patch) => persist({ ...settings, ...patch }),
        regenerateApiKey: () => {
          const ts = Date.now().toString(36);
          const hash = Math.random().toString(36).slice(2, 14);
          persist({
            ...settings,
            apiKey: `invest_iq_${ts}_${hash}`,
            apiKeyCreated: new Date().toISOString().slice(0, 10),
            apiKeyLastUsed: new Date().toISOString().slice(0, 10),
          });
        },
        regenerateOcApiKey: () => {
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
          let key = "";
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          for (const b of bytes) key += alphabet[b % alphabet.length];
          const now = stamp();
          persist({
            ...settings,
            ocApiKey: key,
            ocApiKeyStatus: "active",
            ocApiKeyCreated: now,
            ocApiKeyLastUsed: now,
            ocApiKeyExpires: new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10),
            ocAudit: [{ at: now, event: "New Option Chain API key generated — previous key invalidated" }, ...settings.ocAudit].slice(0, 30),
          });
          return key;
        },
        revokeOcApiKey: () => {
          const now = stamp();
          persist({
            ...settings,
            ocApiKeyStatus: "revoked",
            ocUsers: settings.ocUsers.map((u) => ({ ...u, enabled: false })),
            ocAudit: [{ at: now, event: "Option Chain API key revoked — all user access disabled" }, ...settings.ocAudit].slice(0, 30),
          });
        },
        setOcUserEnabled: (id, enabled) => {
          const u = settings.ocUsers.find((x) => x.id === id);
          persist({
            ...settings,
            ocUsers: settings.ocUsers.map((x) => (x.id === id ? { ...x, enabled } : x)),
            ocAudit: [{ at: stamp(), event: `Access ${enabled ? "enabled" : "disabled"} for ${u?.name ?? id}` }, ...settings.ocAudit].slice(0, 30),
          });
        },
        setOcUserLevel: (id, level) => {
          const u = settings.ocUsers.find((x) => x.id === id);
          persist({
            ...settings,
            ocUsers: settings.ocUsers.map((x) => (x.id === id ? { ...x, level } : x)),
            ocAudit: [{ at: stamp(), event: `Access level for ${u?.name ?? id} set to ${level}` }, ...settings.ocAudit].slice(0, 30),
          });
        },
        removeOcUser: (id) => {
          const u = settings.ocUsers.find((x) => x.id === id);
          persist({
            ...settings,
            ocUsers: settings.ocUsers.filter((x) => x.id !== id),
            ocAudit: [{ at: stamp(), event: `Removed ${u?.name ?? id} from Option Chain access` }, ...settings.ocAudit].slice(0, 30),
          });
        },

      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin outside provider");
  return c;
}
