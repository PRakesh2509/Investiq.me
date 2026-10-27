import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  API_KEY_PREFIX,
  DEFAULT_LOVABLE_ENDPOINT,
  PERMANENT_CHAT_IDS,
  generateApiKey,
} from "@/components/admin/admin-constants";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type KeyScope = "nse" | "global";

/** Metadata about a registered API key. The server never returns the plaintext key. */
export interface KeyInfo {
  configured: boolean;
  createdAt: string | number | null;
  lastUsedAt: string | number | null;
}

export type KeyStatusMap = Record<KeyScope, KeyInfo>;

export type LoginResult = { ok: true } | { ok: false; status: number; error: string };

export interface AdminSettings {
  masterEnabled: boolean;
  /** Secret: kept in memory for the current session only (never persisted). */
  telegramBotToken: string;
  telegramChatId: string;
  notifyNews: boolean;
  notifyQuarterly: boolean;
  notifyRSI: boolean;
  notifyPreMarket: boolean;
  notifyPostMarket: boolean;
  notifyIpo: boolean;
  notifyFunds: boolean;
  sheetUrl: string;
  sheetName: string;
  colName: string;
  colRSI: string;
  colPrice: string;

  /** Secret: plaintext of the key generated/pasted this session. Memory only. */
  nseFnoApiKey: string;
  /** Secret: plaintext of the key generated/pasted this session. Memory only. */
  globalApiKey: string;

  // External Paper Trading Auto-Push Webhook Configuration
  externalTradingEndpoint: string;
  autoPushTradesEnabled: boolean;
  autoPushIntervalSeconds: number;
}

/* -------------------------------------------------------------------------- */
/* Constants & helpers                                                        */
/* -------------------------------------------------------------------------- */

/** Settings fields that hold secrets: they live in memory only and are never written to storage. */
const SECRET_FIELDS = ["telegramBotToken", "nseFnoApiKey", "globalApiKey"] as const;

const defaultSettings: AdminSettings = {
  masterEnabled: true,
  telegramBotToken: "",
  telegramChatId: PERMANENT_CHAT_IDS.join(","),
  notifyNews: true,
  notifyQuarterly: true,
  notifyRSI: true,
  notifyPreMarket: true,
  notifyPostMarket: true,
  notifyIpo: true,
  notifyFunds: true,
  sheetUrl:
    "https://docs.google.com/spreadsheets/d/1WgMLvMlUewkeljWkwFH6Cmcryytn8cWgIXgsmlq1Syo/edit?usp=sharing",
  sheetName: "Sheet1",
  colName: "C",
  colRSI: "B",
  colPrice: "A",
  nseFnoApiKey: "",
  globalApiKey: "",
  externalTradingEndpoint: DEFAULT_LOVABLE_ENDPOINT,
  autoPushTradesEnabled: true,
  autoPushIntervalSeconds: 30,
};

const emptyKeyInfo: KeyInfo = { configured: false, createdAt: null, lastUsedAt: null };
const emptyKeyStatus: KeyStatusMap = { nse: emptyKeyInfo, global: emptyKeyInfo };

function stripSecrets(s: AdminSettings): Partial<AdminSettings> {
  const copy: Partial<AdminSettings> = { ...s };
  for (const f of SECRET_FIELDS) delete copy[f];
  return copy;
}

function parseKeyInfo(raw: unknown): KeyInfo {
  if (!raw || typeof raw !== "object") return emptyKeyInfo;
  const r = raw as Record<string, unknown>;
  const toStamp = (v: unknown): string | number | null =>
    typeof v === "string" || typeof v === "number" ? v : null;
  return {
    configured: r.configured === true,
    createdAt: toStamp(r.createdAt),
    lastUsedAt: toStamp(r.lastUsedAt),
  };
}

function describeStatus(status: number, fallback: string): string {
  if (status === 401 || status === 403) return "Admin session expired — sign in again";
  if (status === 429) return "Too many attempts — wait a moment and try again";
  if (status === 503) return "Admin service is not configured on the server";
  return fallback;
}

const LEGACY_STORAGE_KEYS = [
  "investiq_admin_v1",
  "investiq_admin_settings_v1",
  "investiq_admin_settings_v2",
  "investiq_admin_settings_v3",
  "investiq_admin_settings_v5",
  "groww_session",
  "groww_holdings",
  "groww_token",
  "groww_credentials",
];
const SETTINGS_KEY = "investiq_admin_settings_v6";

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

interface AdminCtx {
  isAdmin: boolean;
  /** False until the initial GET /api/admin/session has resolved. */
  sessionReady: boolean;
  login: (u: string, p: string) => Promise<boolean>;
  /** Same as `login` but reports why it failed (401 / 429 / 503 ...). */
  loginDetailed: (u: string, p: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  settings: AdminSettings;
  updateSettings: (patch: Partial<AdminSettings>) => void;

  /** Registered-key metadata from GET /api/admin/keys. */
  keyStatus: KeyStatusMap;
  keyStatusLoading: boolean;
  refreshKeyStatus: () => Promise<void>;
  /** Generates a key client-side, registers its hash and resolves with the result. */
  rotateKey: (scope: KeyScope) => Promise<{ ok: boolean; key: string; error?: string }>;
  /** Registers a caller-supplied key (rotation). */
  registerKey: (scope: KeyScope, key: string) => Promise<boolean>;
  revokeKey: (scope: KeyScope) => Promise<boolean>;
  /** Keeps a key in memory for the Test buttons without registering anything. */
  setSessionApiKey: (scope: KeyScope, key: string) => void;

  // Stable names kept for existing callers
  deleteAllApiKeys: () => Promise<boolean>;
  rotateNseFnoApiKey: () => string;
  setNseFnoApiKey: (key: string) => void;
  rotateGlobalApiKey: () => string;
  setGlobalApiKey: (key: string) => void;
}

const Ctx = createContext<AdminCtx | null>(null);

async function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "same-origin", ...init });
}

const KEY_FIELD: Record<KeyScope, "nseFnoApiKey" | "globalApiKey"> = {
  nse: "nseFnoApiKey",
  global: "globalApiKey",
};

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatusMap>(emptyKeyStatus);
  const [keyStatusLoading, setKeyStatusLoading] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Hydrate non-secret preferences; wipe every legacy copy (they may contain secrets).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const legacyRaw = raw ? null : localStorage.getItem("investiq_admin_settings_v5");
      const source = raw ?? legacyRaw;
      if (source) {
        const parsed = JSON.parse(source) as Record<string, unknown>;
        const picked: Record<string, unknown> = {};
        for (const k of Object.keys(defaultSettings) as Array<keyof AdminSettings>) {
          if ((SECRET_FIELDS as readonly string[]).includes(k)) continue;
          if (typeof parsed[k] === typeof defaultSettings[k]) picked[k] = parsed[k];
        }
        if (!picked.externalTradingEndpoint) delete picked.externalTradingEndpoint;
        if (!picked.autoPushIntervalSeconds) delete picked.autoPushIntervalSeconds;
        setSettings((prev) => ({ ...prev, ...(picked as Partial<AdminSettings>) }));
      }
      for (const k of LEGACY_STORAGE_KEYS) localStorage.removeItem(k);
    } catch {
      /* storage unavailable — run with defaults */
    }
    setHydrated(true);
  }, []);

  // Persist everything except secrets.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(stripSecrets(settings)));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated]);

  const clearSecrets = useCallback(() => {
    setSettings((prev) => ({ ...prev, telegramBotToken: "", nseFnoApiKey: "", globalApiKey: "" }));
    setKeyStatus(emptyKeyStatus);
  }, []);

  // Admin state comes from the server (HttpOnly cookie) — never from localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch("/api/admin/session");
        const data = res.ok ? ((await res.json()) as { isAdmin?: boolean }) : null;
        if (!cancelled) setIsAdmin(data?.isAdmin === true);
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExpired = useCallback(
    (status: number) => {
      if (status === 401 || status === 403) {
        setIsAdmin(false);
        clearSecrets();
      }
    },
    [clearSecrets],
  );

  const refreshKeyStatus = useCallback(async () => {
    setKeyStatusLoading(true);
    try {
      const res = await adminFetch("/api/admin/keys");
      if (!res.ok) {
        handleExpired(res.status);
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const src = (data.keys && typeof data.keys === "object" ? data.keys : data) as Record<
        string,
        unknown
      >;
      setKeyStatus({ nse: parseKeyInfo(src.nse), global: parseKeyInfo(src.global) });
    } catch {
      /* leave the previous status in place */
    } finally {
      setKeyStatusLoading(false);
    }
  }, [handleExpired]);

  useEffect(() => {
    if (isAdmin) void refreshKeyStatus();
  }, [isAdmin, refreshKeyStatus]);

  const loginDetailed = useCallback(async (u: string, p: string): Promise<LoginResult> => {
    try {
      const res = await adminFetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setIsAdmin(true);
        return { ok: true };
      }
      return {
        ok: false,
        status: res.status,
        error: data?.error || `Sign-in failed (${res.status})`,
      };
    } catch (e) {
      return { ok: false, status: 0, error: (e as Error).message || "Network error" };
    }
  }, []);

  const login = useCallback(
    async (u: string, p: string) => (await loginDetailed(u, p)).ok,
    [loginDetailed],
  );

  const logout = useCallback(async () => {
    try {
      await adminFetch("/api/admin/session", { method: "DELETE" });
    } catch {
      /* the cookie may linger, but local state is cleared regardless */
    }
    setIsAdmin(false);
    clearSecrets();
  }, [clearSecrets]);

  const updateSettings = useCallback((patch: Partial<AdminSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const setSessionApiKey = useCallback((scope: KeyScope, key: string) => {
    setSettings((prev) => ({ ...prev, [KEY_FIELD[scope]]: key.trim() }));
  }, []);

  const registerKey = useCallback(
    async (scope: KeyScope, key: string): Promise<boolean> => {
      const trimmed = key.trim();
      const previous = settingsRef.current[KEY_FIELD[scope]];
      setSettings((prev) => ({ ...prev, [KEY_FIELD[scope]]: trimmed }));
      try {
        const res = await adminFetch("/api/admin/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, key: trimmed }),
        });
        if (!res.ok) {
          setSettings((prev) => ({ ...prev, [KEY_FIELD[scope]]: previous }));
          handleExpired(res.status);
          toast.error(describeStatus(res.status, `Could not register key (${res.status})`));
          return false;
        }
        await refreshKeyStatus();
        return true;
      } catch (e) {
        setSettings((prev) => ({ ...prev, [KEY_FIELD[scope]]: previous }));
        toast.error(`Could not register key: ${(e as Error).message}`);
        return false;
      }
    },
    [handleExpired, refreshKeyStatus],
  );

  const rotateKey = useCallback(
    async (scope: KeyScope) => {
      const key = generateApiKey(scope);
      const ok = await registerKey(scope, key);
      return ok ? { ok, key } : { ok, key: "", error: "Registration failed" };
    },
    [registerKey],
  );

  const revokeKey = useCallback(
    async (scope: KeyScope): Promise<boolean> => {
      try {
        const res = await adminFetch(`/api/admin/keys?scope=${scope}`, { method: "DELETE" });
        if (!res.ok) {
          handleExpired(res.status);
          toast.error(describeStatus(res.status, `Could not revoke key (${res.status})`));
          return false;
        }
        setSettings((prev) => ({ ...prev, [KEY_FIELD[scope]]: "" }));
        await refreshKeyStatus();
        return true;
      } catch (e) {
        toast.error(`Could not revoke key: ${(e as Error).message}`);
        return false;
      }
    },
    [handleExpired, refreshKeyStatus],
  );

  const deleteAllApiKeys = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all([revokeKey("nse"), revokeKey("global")]);
    return results.every(Boolean);
  }, [revokeKey]);

  // Synchronous wrappers: generate client-side, return the plaintext, register in the background.
  const rotateNseFnoApiKey = useCallback((): string => {
    const key = generateApiKey("nse");
    void registerKey("nse", key);
    return key;
  }, [registerKey]);

  const rotateGlobalApiKey = useCallback((): string => {
    const key = generateApiKey("global");
    void registerKey("global", key);
    return key;
  }, [registerKey]);

  const setNseFnoApiKey = useCallback(
    (key: string) => {
      void registerKey("nse", key);
    },
    [registerKey],
  );

  const setGlobalApiKey = useCallback(
    (key: string) => {
      void registerKey("global", key);
    },
    [registerKey],
  );

  const value = useMemo<AdminCtx>(
    () => ({
      isAdmin,
      sessionReady,
      login,
      loginDetailed,
      logout,
      settings,
      updateSettings,
      keyStatus,
      keyStatusLoading,
      refreshKeyStatus,
      rotateKey,
      registerKey,
      revokeKey,
      setSessionApiKey,
      deleteAllApiKeys,
      rotateNseFnoApiKey,
      setNseFnoApiKey,
      rotateGlobalApiKey,
      setGlobalApiKey,
    }),
    [
      isAdmin,
      sessionReady,
      login,
      loginDetailed,
      logout,
      settings,
      updateSettings,
      keyStatus,
      keyStatusLoading,
      refreshKeyStatus,
      rotateKey,
      registerKey,
      revokeKey,
      setSessionApiKey,
      deleteAllApiKeys,
      rotateNseFnoApiKey,
      setNseFnoApiKey,
      rotateGlobalApiKey,
      setGlobalApiKey,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin outside provider");
  return c;
}
