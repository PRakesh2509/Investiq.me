/**
 * Same-origin POST helper for admin-gated endpoints (/api/option-alert, /api/ai-trades,
 * /api/test-trade, /api/public/hooks/*). The admin session cookie is sent automatically;
 * no secret is ever handled client-side. 401/503/non-JSON responses become readable errors.
 */
export const ADMIN_REQUIRED_HINT = "Admin login required";

export interface AdminPostResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function adminPost<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<AdminPostResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  let data: (T & { ok?: boolean; error?: string }) | null = null;
  try {
    data = (await res.json()) as T & { ok?: boolean; error?: string };
  } catch {
    // non-JSON body
  }

  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      data,
      error: "Admin login required. Sign in as admin and retry.",
    };
  }
  if (res.status === 503) {
    return {
      ok: false,
      status: 503,
      data,
      error: data?.error ?? "This service is not configured on the server.",
    };
  }
  if (!data) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Unexpected response (HTTP ${res.status})`,
    };
  }
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      status: res.status,
      data,
      error: data.error ?? `Request failed (HTTP ${res.status})`,
    };
  }
  return { ok: true, status: res.status, data };
}
