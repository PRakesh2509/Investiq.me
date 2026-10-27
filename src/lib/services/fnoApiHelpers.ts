/**
 * Shared helpers for the /api/fno/* routes: query-param validation and response headers.
 */

import { WORKSTATION_INSTRUMENTS } from "../terminal-workstation.functions.ts";
import { DataUnavailableError } from "./dataUnavailableError.ts";

export const DEFAULT_INSTRUMENT = "NIFTY 50";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

export type ParamResult<T> = { ok: true; value: T } | { ok: false; error: string };

function squash(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Resolve an `instrument` query parameter against the WORKSTATION_INSTRUMENTS allow-list.
 * Missing/empty falls back to the default; anything unknown is rejected (never silently
 * substituted with another instrument).
 */
export function parseInstrumentParam(raw: string | null | undefined): ParamResult<string> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: DEFAULT_INSTRUMENT };
  if (trimmed.length > 40) return { ok: false, error: "Invalid instrument" };
  if (Object.prototype.hasOwnProperty.call(WORKSTATION_INSTRUMENTS, trimmed)) {
    return { ok: true, value: trimmed };
  }
  const wanted = squash(trimmed);
  for (const key of Object.keys(WORKSTATION_INSTRUMENTS)) {
    if (squash(key) === wanted) return { ok: true, value: key };
  }
  return {
    ok: false,
    error: `Unknown instrument. Allowed: ${Object.keys(WORKSTATION_INSTRUMENTS).join(", ")}`,
  };
}

/** Optional ISO date (YYYY-MM-DD) expiry parameter. */
export function parseExpiryParam(raw: string | null | undefined): ParamResult<string | undefined> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: "Invalid expiry; expected YYYY-MM-DD" };
  }
  const d = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== trimmed) {
    return { ok: false, error: "Invalid expiry date" };
  }
  return { ok: true, value: trimmed };
}

export function parseNumberParam(
  raw: string | null | undefined,
  name: string,
  opts: { defaultValue: number; min: number; max: number },
): ParamResult<number> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: opts.defaultValue };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < opts.min || n > opts.max) {
    return {
      ok: false,
      error: `Invalid ${name}; expected a number between ${opts.min} and ${opts.max}`,
    };
  }
  return { ok: true, value: n };
}

export function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400, headers: NO_STORE_HEADERS });
}

export function okJson(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Generic 500 that does not leak internal error details to the client. */
export function serverError(scope: string, e: unknown): Response {
  if (e instanceof DataUnavailableError) {
    console.warn(`[${scope}]`, e.message);
    return Response.json(
      { ok: false, error: e.message, reasons: e.notes.slice(0, 5) },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[${scope}]`, message);
  return Response.json(
    { ok: false, error: "Internal error while computing F&O analysis" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
