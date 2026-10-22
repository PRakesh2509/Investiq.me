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

  // Dedicated API Keys for External Paper Trading
  // 1. NSE F&O API Key
  nseFnoApiKey: string;
  nseFnoApiKeyCreated: string;
  nseFnoApiKeyLastUsed: string;

  // 2. GLOBAL API Key
  globalApiKey: string;
  globalApiKeyCreated: string;
  globalApiKeyLastUsed: string;

  // External Paper Trading Auto-Push Webhook Configuration
  externalTradingEndpoint: string;
  autoPushTradesEnabled: boolean;
  autoPushIntervalSeconds: number;

  // Legacy fields preserved for backward compatibility
  apiKey: string;
  apiKeyCreated: string;
  apiKeyLastUsed: string;
  fnoEngineApiKey: string;
  fnoEngineApiKeyCreated: string;
  growwApiKey: string;
  growwApiSecret: string;
  growwSession: string;
  ocApiKey: string;
  ocApiKeyStatus: string;
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
  apiKeys: CustomApiKey[];
}

export interface CustomApiKey {
  id: string;
  name: string;
  type: "fno_engine" | "option_chain" | "broker" | "web" | "custom";
  key: string;
  maskedKey: string;
  createdAt: string;
  expiresAt: string;
  accessLevel: "Full Access" | "Read & Execute" | "Read-only";
  status: "active" | "revoked";
}

export function generateCleanToken(prefix = "iq_live"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint8Array(28);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length; i++) {
      token += chars[arr[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 28; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `${prefix}_${token}`;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return "••••••••••••";
  const start = key.slice(0, 6);
  const end = key.slice(-4);
  return `${start}${"•".repeat(Math.max(8, key.length - 10))}${end}`;
}

// Permanent Telegram chat IDs — do not remove. Always included in outbound alerts.
export const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"] as const;

export const DEFAULT_NSE_FNO_KEY = "iq_nse_fno_live_8f3a9e2c4b71d605a982e3f4";
export const DEFAULT_GLOBAL_KEY = "iq_global_live_6b2d1c9e4a80f735d194c7b2";
export const DEFAULT_LOVABLE_ENDPOINT = "https://637793ac-c049-46b9-aed4-edaff2e3ea91.lovableproject.com/api/public/investiq/trades";

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
  // Dedicated API Keys for External Paper Trading
  // 1. NSE F&O API Key (Active & Ready)
  nseFnoApiKey: DEFAULT_NSE_FNO_KEY,
  nseFnoApiKeyCreated: "2026-10-22",
  nseFnoApiKeyLastUsed: "Active (Ready)",

  // 2. GLOBAL API Key (Active & Ready)
  globalApiKey: DEFAULT_GLOBAL_KEY,
  globalApiKeyCreated: "2026-10-22",
  globalApiKeyLastUsed: "Active (Ready)",

  // External Paper Trading Auto-Push Webhook Configuration
  externalTradingEndpoint: DEFAULT_LOVABLE_ENDPOINT,
  autoPushTradesEnabled: true,
  autoPushIntervalSeconds: 30,

  // Legacy fields
  apiKey: "",
  apiKeyCreated: "",
  apiKeyLastUsed: "",
  fnoEngineApiKey: "",
  fnoEngineApiKeyCreated: "",
  growwApiKey: "",
  growwApiSecret: "",
  growwSession: "",
  ocApiKey: "",
  ocApiKeyStatus: "",
  ocApiKeyCreated: "",
  ocApiKeyLastUsed: "",
  ocApiKeyExpires: "",
  ocUsers: [],
  ocAudit: [
    { at: "2026-08-05 12:00", event: "Option Chain API key registered (active)" },
    { at: "2026-10-22 12:30", event: "All API keys permanently deleted" },
    { at: "2026-10-22 16:45", event: "NSE F&O and GLOBAL dedicated API keys created" },
  ],
  notifyOptionChain: true,
  ocFrequency: "15-min",
  ocThreshold: 5,
  ocStrikeFilter: "ATM ±5",
  ocGreeksAlerts: true,
  ocVolumeAlerts: true,
  apiKeys: [],
};

export function cleanChatIds(chatId: string): string {
  return chatId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

interface AdminCtx {
  isAdmin: boolean;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  settings: AdminSettings;
  updateSettings: (patch: Partial<AdminSettings>) => void;
  deleteAllApiKeys: () => void;
  // Dedicated API Keys for External Paper Trading
  rotateNseFnoApiKey: () => string;
  setNseFnoApiKey: (key: string) => void;
  rotateGlobalApiKey: () => string;
  setGlobalApiKey: (key: string) => void;
  // Legacy handlers preserved
  setWebpageApiKey: (key: string) => void;
  deleteWebpageApiKey: () => void;
  setFnoEngineApiKey: (key: string) => void;
  deleteFnoEngineApiKey: () => void;
  setGrowwCredentials: (apiKey: string, secret: string) => void;
  deleteGrowwCredentials: () => void;
  setOcApiKey: (key: string, expires?: string) => void;
  deleteOcApiKey: () => void;
  setOcUserLevel: (id: string, level: OcAccessLevel) => void;
  setOcUserEnabled: (id: string, enabled: boolean) => void;
  removeOcUser: (id: string) => void;
  addOcUser: (user: Omit<OcUser, "id" | "lastActivity">) => void;
  // Helpers
  createApiKey: (params: {
    name: string;
    type: CustomApiKey["type"];
    customKey?: string;
    accessLevel: CustomApiKey["accessLevel"];
    expiresAt?: string;
  }) => CustomApiKey;
  revokeApiKey: (id: string) => void;
  deleteApiKey: (id: string) => void;
  rotateApiKey: (id: string) => CustomApiKey | null;
}

const Ctx = createContext<AdminCtx | null>(null);
const KEY = "investiq_admin_v1";
const SETTINGS_KEY = "investiq_admin_settings_v5";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);

  useEffect(() => {
    try {
      setIsAdmin(localStorage.getItem(KEY) === "1");
      // Permanently remove legacy settings and cached broker/token keys
      localStorage.removeItem("investiq_admin_settings_v1");
      localStorage.removeItem("investiq_admin_settings_v2");
      localStorage.removeItem("investiq_admin_settings_v3");
      localStorage.removeItem("groww_session");
      localStorage.removeItem("groww_holdings");
      localStorage.removeItem("groww_token");
      localStorage.removeItem("groww_credentials");

      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure dedicated keys are present and active
        parsed.nseFnoApiKey = parsed.nseFnoApiKey || defaultSettings.nseFnoApiKey;
        parsed.globalApiKey = parsed.globalApiKey || defaultSettings.globalApiKey;
        parsed.externalTradingEndpoint = parsed.externalTradingEndpoint || defaultSettings.externalTradingEndpoint;
        if (typeof parsed.autoPushTradesEnabled !== "boolean") {
          parsed.autoPushTradesEnabled = true;
        }
        if (!parsed.autoPushIntervalSeconds) {
          parsed.autoPushIntervalSeconds = 30;
        }
        if (!Array.isArray(parsed.apiKeys)) {
          parsed.apiKeys = [];
        }
        if (!Array.isArray(parsed.ocUsers)) {
          parsed.ocUsers = [];
        }
        if (!Array.isArray(parsed.ocAudit) || parsed.ocAudit.length === 0) {
          parsed.ocAudit = defaultSettings.ocAudit;
        }
        const merged = { ...defaultSettings, ...parsed };
        if (typeof merged.telegramChatId !== "string") {
          merged.telegramChatId = defaultSettings.telegramChatId;
        }
        setSettings(merged);
      } else {
        // First load with v5: initialize with active dedicated keys
        setSettings(defaultSettings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
      }
    } catch {}
  }, []);

  const persist = (s: AdminSettings) => {
    setSettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {}
  };

  const createApiKey = (params: {
    name: string;
    type: CustomApiKey["type"];
    customKey?: string;
    accessLevel: CustomApiKey["accessLevel"];
    expiresAt?: string;
  }): CustomApiKey => {
    const keyVal = params.customKey?.trim() || generateCleanToken();
    const newKey: CustomApiKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: params.name.trim() || "Untitled API Key",
      type: params.type,
      key: keyVal,
      maskedKey: maskApiKey(keyVal),
      createdAt: new Date().toISOString().split("T")[0],
      expiresAt: params.expiresAt || "Never",
      accessLevel: params.accessLevel || "Full Access",
      status: "active",
    };
    const updated = [newKey, ...(settings.apiKeys || [])];
    persist({ ...settings, apiKeys: updated });
    return newKey;
  };

  // Hard delete: no status = "revoked" rows left behind
  const revokeApiKey = (id: string) => {
    deleteApiKey(id);
  };

  const deleteApiKey = (id: string) => {
    const updated = (settings.apiKeys || []).filter((k) => k.id !== id);
    persist({ ...settings, apiKeys: updated });
  };

  const rotateApiKey = (id: string): CustomApiKey | null => {
    const target = (settings.apiKeys || []).find((k) => k.id === id);
    if (!target) return null;
    const newKeyVal = generateCleanToken();
    const updatedKey: CustomApiKey = {
      ...target,
      key: newKeyVal,
      maskedKey: maskApiKey(newKeyVal),
      createdAt: new Date().toISOString().split("T")[0],
      status: "active",
    };
    const updated = (settings.apiKeys || []).map((k) => (k.id === id ? updatedKey : k));
    persist({ ...settings, apiKeys: updated });
    return updatedKey;
  };

  const deleteAllApiKeys = () => {
    const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const updatedAudit: OcAuditEntry[] = [
      ...(settings.ocAudit || []),
      { at: nowStamp, event: "All API keys permanently deleted" },
    ];

    const purged: AdminSettings = {
      ...settings,
      apiKey: "",
      apiKeyCreated: "",
      apiKeyLastUsed: "",
      fnoEngineApiKey: "",
      fnoEngineApiKeyCreated: "",
      growwApiKey: "",
      growwApiSecret: "",
      growwSession: "",
      ocApiKey: "",
      ocApiKeyStatus: "",
      ocApiKeyCreated: "",
      ocApiKeyLastUsed: "",
      ocApiKeyExpires: "",
      ocUsers: [],
      ocAudit: updatedAudit,
      apiKeys: [],
    };

    persist(purged);

    try {
      localStorage.removeItem("groww_session");
      localStorage.removeItem("groww_holdings");
      localStorage.removeItem("groww_token");
      sessionStorage.clear();
    } catch {}
  };

  // Dedicated API Keys for External Paper Trading
  const rotateNseFnoApiKey = (): string => {
    const newKey = generateCleanToken("iq_nse_fno");
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      nseFnoApiKey: newKey,
      nseFnoApiKeyCreated: now,
      nseFnoApiKeyLastUsed: "Active (Rotated)",
    });
    return newKey;
  };

  const setNseFnoApiKey = (key: string) => {
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      nseFnoApiKey: key.trim(),
      nseFnoApiKeyCreated: now,
      nseFnoApiKeyLastUsed: "Active",
    });
  };

  const rotateGlobalApiKey = (): string => {
    const newKey = generateCleanToken("iq_global");
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      globalApiKey: newKey,
      globalApiKeyCreated: now,
      globalApiKeyLastUsed: "Active (Rotated)",
    });
    return newKey;
  };

  const setGlobalApiKey = (key: string) => {
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      globalApiKey: key.trim(),
      globalApiKeyCreated: now,
      globalApiKeyLastUsed: "Active",
    });
  };

  // Section 1: Webpage API Key
  const setWebpageApiKey = (key: string) => {
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      apiKey: key.trim(),
      apiKeyCreated: now,
      apiKeyLastUsed: now,
    });
  };

  const deleteWebpageApiKey = () => {
    persist({
      ...settings,
      apiKey: "",
      apiKeyCreated: "",
      apiKeyLastUsed: "",
    });
  };

  // Section 2: F&O Trading Engine Key
  const setFnoEngineApiKey = (key: string) => {
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      fnoEngineApiKey: key.trim(),
      fnoEngineApiKeyCreated: now,
    });
  };

  const deleteFnoEngineApiKey = () => {
    persist({
      ...settings,
      fnoEngineApiKey: "",
      fnoEngineApiKeyCreated: "",
    });
  };

  // Section 3: Groww Trading API
  const setGrowwCredentials = (apiKey: string, secret: string) => {
    persist({
      ...settings,
      growwApiKey: apiKey.trim(),
      growwApiSecret: secret.trim(),
      growwSession: "Investiq",
    });
  };

  const deleteGrowwCredentials = () => {
    persist({
      ...settings,
      growwApiKey: "",
      growwApiSecret: "",
      growwSession: "",
    });
    try {
      localStorage.removeItem("groww_session");
      localStorage.removeItem("groww_holdings");
      localStorage.removeItem("groww_token");
    } catch {}
  };

  // Section 4: Option Chain API Key
  const setOcApiKey = (key: string, expires = "Never") => {
    const now = new Date().toISOString().split("T")[0];
    persist({
      ...settings,
      ocApiKey: key.trim(),
      ocApiKeyStatus: "active",
      ocApiKeyCreated: now,
      ocApiKeyLastUsed: now,
      ocApiKeyExpires: expires,
    });
  };

  const deleteOcApiKey = () => {
    persist({
      ...settings,
      ocApiKey: "",
      ocApiKeyStatus: "",
      ocApiKeyCreated: "",
      ocApiKeyLastUsed: "",
      ocApiKeyExpires: "",
      ocUsers: [],
    });
  };

  const setOcUserLevel = (id: string, level: OcAccessLevel) => {
    const updated = (settings.ocUsers || []).map((u) =>
      u.id === id ? { ...u, level } : u
    );
    persist({ ...settings, ocUsers: updated });
  };

  const setOcUserEnabled = (id: string, enabled: boolean) => {
    const updated = (settings.ocUsers || []).map((u) =>
      u.id === id ? { ...u, enabled } : u
    );
    persist({ ...settings, ocUsers: updated });
  };

  const removeOcUser = (id: string) => {
    const updated = (settings.ocUsers || []).filter((u) => u.id !== id);
    persist({ ...settings, ocUsers: updated });
  };

  const addOcUser = (user: Omit<OcUser, "id" | "lastActivity">) => {
    const newUser: OcUser = {
      ...user,
      id: `u-${Date.now().toString().slice(-4)}`,
      lastActivity: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    persist({ ...settings, ocUsers: [...(settings.ocUsers || []), newUser] });
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
        deleteAllApiKeys,
        rotateNseFnoApiKey,
        setNseFnoApiKey,
        rotateGlobalApiKey,
        setGlobalApiKey,
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
        createApiKey,
        revokeApiKey,
        deleteApiKey,
        rotateApiKey,
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
