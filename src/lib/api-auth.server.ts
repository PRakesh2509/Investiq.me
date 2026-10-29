/**
 * API authentication, CORS and outbound-URL safety for the external /api/v1 surface.
 *
 * Two authorized scopes:
 * 1. NSE F&O: NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, MIDCAP NIFTY
 * 2. GLOBAL: S&P 500, NASDAQ 100, DOW JONES
 *
 * Security model (fail closed):
 *  - There are NO built-in keys. A key is valid only if it matches (constant time) an entry of
 *    the NSE_FNO_API_KEY / GLOBAL_API_KEY env var (comma-separated list, for rotation) or the
 *    SHA-256 hash stored in the `api_keys` table (one active row per scope).
 *  - Keys are accepted ONLY via the `x-api-key` header or `Authorization: Bearer`.
 *  - CORS is an allowlist (app origin + ALLOWED_ORIGINS), never a wildcard.
 *
 * This module must stay importable by `node --test` (no Nitro-only imports); the Supabase client
 * is loaded lazily and only when the service role is configured.
 */

import { getAppBaseUrl } from "./app-url.ts";

export type KeyScope = "nse" | "global";

export const KEY_PREFIX: Record<KeyScope, string> = {
  nse: "iq_nse_fno_",
  global: "iq_global_",
};

export const MIN_MANAGED_KEY_LENGTH = 40;

const KEY_ENV: Record<KeyScope, string> = {
  nse: "NSE_FNO_API_KEY",
  global: "GLOBAL_API_KEY",
};

/** Throttle for the best-effort `last_used_at` write. */
const LAST_USED_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Small env / encoding helpers
// ---------------------------------------------------------------------------

export function readEnv(name: string): string {
  // 1. Cloudflare Workers env injected by Nitro onto globalThis.__env__
  const cfEnv = (globalThis as unknown as { __env__?: Record<string, unknown> }).__env__;
  if (cfEnv && typeof cfEnv[name] === "string" && (cfEnv[name] as string).trim()) {
    return (cfEnv[name] as string).trim();
  }
  // 2. Direct globalThis binding
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g[name] === "string" && (g[name] as string).trim()) {
    return (g[name] as string).trim();
  }
  // 3. Node / Vite development process.env
  if (typeof process !== "undefined" && process?.env && typeof process.env[name] === "string") {
    return (process.env[name] ?? "").trim();
  }
  return "";
}

/** Split a comma-separated env value into trimmed, non-empty entries. */
export function parseList(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, "0");
  return out;
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await sha256Bytes(input));
}

/**
 * Constant-time string comparison. Both sides are hashed first so the comparison time does not
 * depend on length or on the position of the first differing character.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/** Compare `candidate` against every entry (no early exit) in constant time per entry. */
export async function matchesAnyKey(candidate: string, keys: string[]): Promise<boolean> {
  if (!candidate || keys.length === 0) return false;
  let matched = false;
  for (const k of keys) {
    if (await constantTimeEqual(candidate, k)) matched = true;
  }
  return matched;
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// CORS (allowlist)
// ---------------------------------------------------------------------------

function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, "").toLowerCase();
}

export function getAllowedOrigins(): string[] {
  const list = [getAppBaseUrl(), ...parseList(readEnv("ALLOWED_ORIGINS"))]
    .map(normalizeOrigin)
    .filter(Boolean);
  return Array.from(new Set(list));
}

/** Returns the origin to reflect, or null if the origin is absent / not allowed. */
export function resolveCorsOrigin(origin: string | null, allowed: string[]): string | null {
  if (!origin) return null;
  const norm = normalizeOrigin(origin);
  return allowed.includes(norm) ? origin : null;
}

export function corsHeaders(request?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reflected = request
    ? resolveCorsOrigin(request.headers.get("origin"), getAllowedOrigins())
    : null;
  if (reflected) headers["Access-Control-Allow-Origin"] = reflected;
  return headers;
}

/** Preflight response. Disallowed browser origins get 403 (no CORS headers are granted). */
export function optionsResponse(request: Request): Response {
  const origin = request.headers.get("origin");
  if (origin && !resolveCorsOrigin(origin, getAllowedOrigins())) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(body: unknown, status = 200, request?: Request): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

// ---------------------------------------------------------------------------
// API key extraction + validation
// ---------------------------------------------------------------------------

/** Keys are accepted only via `x-api-key` or `Authorization: Bearer` (never the query string). */
export function extractApiKey(request: Request): string {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey && headerKey.trim()) return headerKey.trim();

  const authHeader = request.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^bearer\s+/i, "").trim();
  }
  return "";
}

export function getEnvKeys(scope: KeyScope): string[] {
  return parseList(readEnv(KEY_ENV[scope]));
}

/** True when the service-role client can be used (explicit service role key present). */
export function isServiceRoleConfigured(): boolean {
  return Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

/**
 * Lazily load the service-role Supabase client. Returns null when it is not configured.
 * The tables used here are not in the generated Database types, hence the loose typing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceClient(): Promise<any | null> {
  if (!isServiceRoleConfigured()) return null;
  try {
    const mod = await import("../integrations/supabase/client.server.ts");
    return mod.supabaseAdmin;
  } catch (err) {
    console.warn("[api-auth] service-role client unavailable:", (err as Error)?.message);
    return null;
  }
}

export interface StoredKeyInfo {
  scope: KeyScope;
  keyHash: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export async function readStoredKeys(scopes: KeyScope[]): Promise<StoredKeyInfo[]> {
  const client = await getServiceClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("api_keys")
      .select("scope,key_hash,created_at,last_used_at")
      .in("scope", scopes);
    if (error || !Array.isArray(data)) {
      if (error) console.warn("[api-auth] api_keys read failed:", error.message);
      return [];
    }
    return data.map((r: Record<string, string | null>) => ({
      scope: r.scope as KeyScope,
      keyHash: String(r.key_hash ?? ""),
      createdAt: r.created_at ?? null,
      lastUsedAt: r.last_used_at ?? null,
    }));
  } catch (err) {
    console.warn("[api-auth] api_keys read threw:", (err as Error)?.message);
    return [];
  }
}

async function touchLastUsed(scope: KeyScope, lastUsedAt: string | null): Promise<void> {
  try {
    const last = lastUsedAt ? Date.parse(lastUsedAt) : 0;
    if (Number.isFinite(last) && Date.now() - last < LAST_USED_TOUCH_INTERVAL_MS) return;
    const client = await getServiceClient();
    if (!client) return;
    await client
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("scope", scope);
  } catch {
    // best effort only
  }
}

/**
 * Validate `key` against the given scopes. Fail closed: empty key, no configured key, or any
 * storage error all result in `false`.
 */
export async function checkKeyScopes(
  key: string,
  scopes: KeyScope[],
): Promise<Record<KeyScope, boolean>> {
  const result: Record<KeyScope, boolean> = { nse: false, global: false };
  if (!key) return result;

  const needDb: KeyScope[] = [];
  for (const scope of scopes) {
    if (await matchesAnyKey(key, getEnvKeys(scope))) result[scope] = true;
    else needDb.push(scope);
  }
  if (needDb.length === 0) return result;

  const rows = await readStoredKeys(needDb);
  if (rows.length === 0) return result;
  const keyHash = await sha256Hex(key);
  for (const row of rows) {
    if (!row.keyHash) continue;
    if (await constantTimeEqual(keyHash, row.keyHash)) {
      result[row.scope] = true;
      await touchLastUsed(row.scope, row.lastUsedAt);
    }
  }
  return result;
}

export async function validateNseFnoKey(key: string): Promise<boolean> {
  return (await checkKeyScopes(key, ["nse"])).nse;
}

export async function validateGlobalKey(key: string): Promise<boolean> {
  return (await checkKeyScopes(key, ["global"])).global;
}

/** Validate against both scopes with a single storage round-trip. */
export async function validateAnyKey(key: string): Promise<{ nse: boolean; global: boolean }> {
  return checkKeyScopes(key, ["nse", "global"]);
}

// ---------------------------------------------------------------------------
// Outbound URL validation (SSRF)
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".lan",
  ".home.arpa",
  ".intranet",
  ".corp",
  ".svc",
  ".cluster.local",
];

function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

export function isPrivateOrReservedIPv4(parts: number[]): boolean {
  const [a, b, c] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

export function hostMatchesAllowlist(host: string, allowed: string[]): boolean {
  return allowed.some((entry) => {
    const e = entry.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    return e !== "" && (host === e || host.endsWith(`.${e}`));
  });
}

export type OutboundUrlResult = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Resolve-free SSRF validation for admin/API supplied outbound targets.
 * https only, default port only, no embedded credentials, no localhost / private / link-local /
 * metadata hosts or IP literals, optional hostname allowlist (DISPATCH_ALLOWED_HOSTS).
 * DNS is not resolved here; callers should additionally use `redirect: "manual"`.
 */
export function validateOutboundUrl(
  raw: string,
  options?: { allowedHosts?: string[] },
): OutboundUrlResult {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, reason: "Target URL is not a valid absolute URL." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Target URL must use https." };
  if (url.username || url.password) {
    return { ok: false, reason: "Target URL must not contain credentials." };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, reason: "Target URL must use the default https port." };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "Target URL has no host." };

  // IPv6 literals (URL.hostname keeps the brackets) are never accepted.
  if (host.startsWith("[") || host.includes(":")) {
    return { ok: false, reason: "IPv6 literal targets are not allowed." };
  }

  const ipv4 = parseIPv4(host);
  if (ipv4) {
    if (isPrivateOrReservedIPv4(ipv4)) {
      return { ok: false, reason: "Target resolves to a private or reserved address." };
    }
  } else {
    if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      return { ok: false, reason: "Target host is not allowed." };
    }
    if (!host.includes(".")) return { ok: false, reason: "Target host must be a public FQDN." };
    // A purely numeric trailing label means a (non-canonical) IP form the URL parser did not normalize.
    if (/^\d+$/.test(host.split(".").pop() ?? "")) {
      return { ok: false, reason: "Target host looks like an IP address." };
    }
  }

  const allowedHosts = options?.allowedHosts ?? parseList(readEnv("DISPATCH_ALLOWED_HOSTS"));
  if (allowedHosts.length > 0 && !hostMatchesAllowlist(host, allowedHosts)) {
    return { ok: false, reason: "Target host is not in DISPATCH_ALLOWED_HOSTS." };
  }

  return { ok: true, url };
}
