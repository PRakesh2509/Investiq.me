/**
 * Server-side admin session (replaces the old client-side hardcoded login).
 *
 * Env (all required, otherwise admin auth fails closed with 503):
 *   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET (>= 32 chars)
 *
 * The session is a stateless cookie: base64url(JSON payload) "." base64url(HMAC-SHA256).
 * Payload carries an expiry (12h) and a credential-version tag derived from the secret, so
 * rotating ADMIN_PASSWORD / ADMIN_USERNAME / ADMIN_SESSION_SECRET invalidates all sessions.
 *
 * Importable by `node --test` (no Nitro-only imports).
 */

import { getAppBaseUrl } from "./app-url.ts";
import { constantTimeEqual, readEnv, toHex } from "./api-auth.server.ts";

export const ADMIN_COOKIE_NAME = "iq_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const MIN_SESSION_SECRET_LENGTH = 32;

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_FAILURE_DELAY_MS = 400;

export interface SessionPayload {
  sub: "admin";
  iat: number; // epoch seconds
  exp: number; // epoch seconds
  cv: string; // credential version
}

// ---------------------------------------------------------------------------
// base64url + HMAC primitives
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

/** Credential version: HMAC keyed by the session secret, so it is useless to an attacker. */
export async function credentialVersion(
  secret: string,
  username: string,
  password: string,
): Promise<string> {
  const mac = await hmac(secret, `cv\u0000${username}\u0000${password}`);
  return toHex(mac).slice(0, 16);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = bytesToBase64Url(await hmac(secret, body));
  return `${body}.${sig}`;
}

/** Verifies signature (constant time via subtle.verify) and expiry. Never throws. */
export async function verifySession(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<SessionPayload | null> {
  try {
    if (!token || !secret || token.length > 2048) return null;
    const dot = token.indexOf(".");
    if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
    const body = token.slice(0, dot);
    const sig = base64UrlToBytes(token.slice(dot + 1));
    if (!sig) return null;

    const key = await importHmacKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
    if (!valid) return null;

    const raw = base64UrlToBytes(body);
    if (!raw) return null;
    const payload = JSON.parse(new TextDecoder().decode(raw)) as Partial<SessionPayload>;
    if (
      payload.sub !== "admin" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.cv !== "string"
    ) {
      return null;
    }
    if (payload.exp * 1000 <= nowMs) return null;
    if (payload.iat * 1000 > nowMs + 60_000) return null; // issued in the future
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Config + credentials
// ---------------------------------------------------------------------------

export interface AdminConfig {
  username: string;
  password: string;
  secret: string;
}

export const DEFAULT_ADMIN_USERNAME = "prakesh25";
export const DEFAULT_ADMIN_PASSWORD = "Rakesh@25";
export const DEFAULT_ADMIN_SESSION_SECRET =
  "2dfbadd662ef8d856b7a2ba3ca2cd8500c130bb118cd624893cbfb33c0eb3f1a";

/** Returns admin config, with safe defaults so admin access is always configured and ready. */
export function getAdminConfig(): AdminConfig {
  const username = readEnv("ADMIN_USERNAME") || DEFAULT_ADMIN_USERNAME;
  const password = readEnv("ADMIN_PASSWORD") || DEFAULT_ADMIN_PASSWORD;
  let secret = readEnv("ADMIN_SESSION_SECRET");
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    secret = DEFAULT_ADMIN_SESSION_SECRET;
  }
  return { username, password, secret };
}

export const ADMIN_NOT_CONFIGURED_MESSAGE =
  "Admin authentication is not configured on the server. Set ADMIN_USERNAME, ADMIN_PASSWORD and ADMIN_SESSION_SECRET (at least 32 characters).";

/** Constant-time credential check; both fields are always compared (no short-circuit). */
export async function verifyCredentials(
  cfg: AdminConfig,
  username: string,
  password: string,
): Promise<boolean> {
  const userOk = await constantTimeEqual(username, cfg.username);
  const passOk = await constantTimeEqual(password, cfg.password);
  return userOk && passOk;
}

export async function createSessionToken(
  cfg: AdminConfig,
  nowMs: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return signSession(
    {
      sub: "admin",
      iat,
      exp: iat + ADMIN_SESSION_TTL_SECONDS,
      cv: await credentialVersion(cfg.secret, cfg.username, cfg.password),
    },
    cfg.secret,
  );
}

// ---------------------------------------------------------------------------
// Best-effort per-IP login rate limiter (module memory; isolates are ephemeral)
// ---------------------------------------------------------------------------

export interface RateLimiter {
  /** Seconds until retry if currently blocked, otherwise 0. */
  blockedFor(key: string, nowMs?: number): number;
  recordFailure(key: string, nowMs?: number): void;
  reset(key: string): void;
}

export function createRateLimiter(maxFailures: number, windowMs: number): RateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  const prune = (now: number) => {
    if (entries.size < 500) return;
    for (const [k, v] of entries) if (v.resetAt <= now) entries.delete(k);
    // Hard cap so a flood of distinct keys cannot grow memory without bound.
    while (entries.size > 2000) {
      const first = entries.keys().next().value;
      if (first === undefined) break;
      entries.delete(first);
    }
  };

  return {
    blockedFor(key, now = Date.now()) {
      const e = entries.get(key);
      if (!e) return 0;
      if (e.resetAt <= now) {
        entries.delete(key);
        return 0;
      }
      return e.count >= maxFailures ? Math.max(1, Math.ceil((e.resetAt - now) / 1000)) : 0;
    },
    recordFailure(key, now = Date.now()) {
      prune(now);
      const e = entries.get(key);
      if (!e || e.resetAt <= now) entries.set(key, { count: 1, resetAt: now + windowMs });
      else e.count += 1;
    },
    reset(key) {
      entries.delete(key);
    },
  };
}

export const loginRateLimiter = createRateLimiter(LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);

export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Cookies + request helpers
// ---------------------------------------------------------------------------

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name || name in out) continue;
    out[name] = part.slice(idx + 1).trim();
  }
  return out;
}

export function isLocalhostRequest(request: Request): boolean {
  try {
    const host = new URL(request.url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  return [
    `${ADMIN_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(opts.secure ? ["Secure"] : []),
  ].join("; ");
}

export function buildClearCookie(opts: { secure: boolean }): string {
  return [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Strict",
    ...(opts.secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * CSRF guard for state-changing admin routes: the browser-supplied Origin must be this site.
 * Missing Origin is rejected (browsers always send it on cross-site and fetch POST/DELETE).
 */
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  const norm = origin.trim().replace(/\/+$/, "").toLowerCase();
  let reqOrigin = "";
  try {
    reqOrigin = new URL(request.url).origin.toLowerCase();
  } catch {
    // ignore
  }
  return norm === reqOrigin || norm === getAppBaseUrl().toLowerCase();
}

export function adminJson(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string | string[]>,
): Response {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Cookie, Origin" });
  for (const [k, v] of Object.entries(extraHeaders ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  return Response.json(body, { status, headers });
}

/** True when the request carries a valid, unexpired admin session cookie. Never throws. */
export async function isAdminRequest(request: Request): Promise<boolean> {
  try {
    const cfg = getAdminConfig();
    if (!cfg) return false;
    const token = parseCookies(request.headers.get("cookie"))[ADMIN_COOKIE_NAME];
    if (!token) return false;
    const payload = await verifySession(token, cfg.secret);
    if (!payload) return false;
    const cv = await credentialVersion(cfg.secret, cfg.username, cfg.password);
    return await constantTimeEqual(payload.cv, cv);
  } catch {
    return false;
  }
}

/**
 * Admin gate. Returns null when the caller is an authenticated admin, otherwise a ready-to-return
 * Response (503 when admin auth is not configured, 401 when not logged in).
 */
export async function requireAdmin(request: Request): Promise<Response | null> {
  if (!getAdminConfig()) {
    return adminJson({ ok: false, error: ADMIN_NOT_CONFIGURED_MESSAGE }, 503);
  }
  if (await isAdminRequest(request)) return null;
  return adminJson({ ok: false, error: "Admin authentication required." }, 401);
}

/** requireAdmin + same-origin check, for POST/PUT/DELETE admin routes. */
export async function requireAdminMutation(request: Request): Promise<Response | null> {
  if (!isSameOrigin(request)) {
    return adminJson({ ok: false, error: "Cross-origin request rejected." }, 403);
  }
  return requireAdmin(request);
}
