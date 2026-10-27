/**
 * Authentication + response helpers for cron / alert / webhook endpoints.
 *
 * - `requireCronAuth(request)`: shared-secret auth for every alert hook and
 *   Telegram/Gemini trigger. Accepts `x-cron-secret: <CRON_SECRET>` or
 *   `Authorization: Bearer <CRON_SECRET>`. Fail-closed: when CRON_SECRET is not
 *   configured the endpoint answers 503 (only localhost in non-production is
 *   allowed through, to keep local development usable).
 *   A valid admin session cookie (admin UI) is also accepted, with the same-origin
 *   CSRF check from `requireAdminMutation`. Cron-secret requests skip the origin check.
 * - `requireTelegramWebhookAuth(request)`: verifies Telegram's
 *   `X-Telegram-Bot-Api-Secret-Token` header against TELEGRAM_WEBHOOK_SECRET.
 *
 * Pure Web APIs only (no Nitro / Node-only imports) so it runs on Cloudflare
 * Workers and under `node --test --experimental-strip-types`.
 */

import { ADMIN_COOKIE_NAME, requireAdminMutation } from "./admin-session.server.ts";

export const CRON_SECRET_HEADER = "x-cron-secret";
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Constant-time string comparison (XOR over UTF-8 bytes, no early exit). */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/** Secret presented by the caller: `x-cron-secret` first, else `Authorization: Bearer`. */
export function extractProvidedSecret(headers: Headers): string {
  const direct = headers.get(CRON_SECRET_HEADER);
  if (direct && direct.trim()) return direct.trim();
  const auth = headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export type AuthDecision = { ok: true } | { ok: false; status: 401 | 403 | 503; error: string };

/** Pure decision function behind `requireCronAuth` (unit-tested). */
export function evaluateCronAuth(input: {
  expected?: string | null;
  provided?: string | null;
  hostname?: string;
  isProduction?: boolean;
}): AuthDecision {
  const expected = (input.expected ?? "").trim();
  if (!expected) {
    if (!input.isProduction && input.hostname && isLocalHostname(input.hostname)) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured on the server; endpoint is disabled.",
    };
  }
  const provided = (input.provided ?? "").trim();
  if (!provided || !constantTimeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

/** Pure decision function behind `requireTelegramWebhookAuth` (unit-tested). */
export function evaluateWebhookAuth(input: {
  expected?: string | null;
  provided?: string | null;
}): AuthDecision {
  const expected = (input.expected ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "TELEGRAM_WEBHOOK_SECRET is not configured on the server; webhook is disabled.",
    };
  }
  const provided = (input.provided ?? "").trim();
  if (!provided || !constantTimeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

function envVar(name: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[name] : undefined;
}

function denied(decision: Extract<AuthDecision, { ok: false }>): Response {
  const headers: Record<string, string> = { ...NO_STORE };
  if (decision.status === 401) headers["www-authenticate"] = 'Bearer realm="investiq-cron"';
  return Response.json({ ok: false, error: decision.error }, { status: decision.status, headers });
}

function hostnameOf(request: Request): string | undefined {
  try {
    return new URL(request.url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Combine the cron-secret decision with the outcome of an admin-session attempt.
 * `adminStatus`: null = no admin cookie presented, 0 = admin session valid (and same-origin),
 * otherwise the HTTP status requireAdminMutation answered with.
 * - cron ok -> allowed (no origin check)
 * - admin ok -> allowed
 * - admin cookie valid but cross-origin (403) -> 403
 * - otherwise the cron denial stands (401, or 503 when CRON_SECRET is unset: fail-closed)
 */
export function resolveAccess(cron: AuthDecision, adminStatus: number | null): AuthDecision {
  if (cron.ok) return cron;
  if (adminStatus === 0) return { ok: true };
  if (adminStatus === 403) {
    return { ok: false, status: 403, error: "Cross-origin request rejected." };
  }
  return cron;
}

/**
 * Returns a ready-to-send 401/403/503 Response when the request is not authorized, else null.
 * Accepts CRON_SECRET (header) or a valid admin session cookie from a same-origin request.
 */
export async function requireCronAuth(request: Request): Promise<Response | null> {
  const cron = evaluateCronAuth({
    expected: envVar("CRON_SECRET"),
    provided: extractProvidedSecret(request.headers),
    hostname: hostnameOf(request),
    isProduction: envVar("NODE_ENV") === "production",
  });
  if (cron.ok) return null;

  let adminStatus: number | null = null;
  const cookie = request.headers.get("cookie") ?? "";
  if (cookie.includes(ADMIN_COOKIE_NAME)) {
    try {
      const res = await requireAdminMutation(request);
      adminStatus = res === null ? 0 : res.status;
    } catch {
      adminStatus = null;
    }
  }
  const decision = resolveAccess(cron, adminStatus);
  return decision.ok ? null : denied(decision);
}

/** Telegram webhook auth: `X-Telegram-Bot-Api-Secret-Token` must equal TELEGRAM_WEBHOOK_SECRET. */
export function requireTelegramWebhookAuth(request: Request): Response | null {
  const decision = evaluateWebhookAuth({
    expected: envVar("TELEGRAM_WEBHOOK_SECRET"),
    provided: request.headers.get(TELEGRAM_SECRET_HEADER),
  });
  return decision.ok ? null : denied(decision);
}

/** True when the caller supplied cron-style credentials (so it is not a Telegram webhook call). */
export function hasCronCredentials(request: Request): boolean {
  return extractProvidedSecret(request.headers) !== "";
}

/** Parse a JSON body defensively: never throws, rejects oversized payloads, returns {} on failure. */
export async function readJsonBody<T extends object = Record<string, unknown>>(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Partial<T>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return {};
  try {
    const text = await request.text();
    if (!text || text.length > maxBytes) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<T>)
      : {};
  } catch {
    return {};
  }
}

export interface HookSummary {
  /** Number of Telegram messages (recipient deliveries) sent. */
  sent: number;
  /** Items intentionally not processed (deduped, market closed, nothing new...). */
  skipped: number;
  /** Non-fatal per-item / per-provider errors (never contain secrets). */
  errors: string[];
  [extra: string]: unknown;
}

/**
 * Structured hook response `{ ok, sent, skipped, errors, ...extra }`.
 * ok = no errors, or at least one message went out despite partial failures.
 * Status is 200 when ok, 502 when everything failed.
 */
export function hookResponse(summary: HookSummary, statusOverride?: number): Response {
  const ok = summary.errors.length === 0 || summary.sent > 0;
  return Response.json(
    { ok, ...summary },
    { status: statusOverride ?? (ok ? 200 : 502), headers: NO_STORE },
  );
}

/** Fatal hook failure (misconfiguration etc.) in the same envelope shape. */
export function hookFailure(error: string, status = 500, extra: Record<string, unknown> = {}) {
  return Response.json(
    { ok: false, sent: 0, skipped: 0, errors: [error], ...extra },
    { status, headers: NO_STORE },
  );
}
