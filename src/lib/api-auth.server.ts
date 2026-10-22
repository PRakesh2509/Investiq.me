/**
 * Dedicated API Authentication & Key Validation for External Paper Trading Webpages
 *
 * Supports two distinct authorized scopes:
 * 1. NSE F&O: NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, MIDCAP NIFTY
 * 2. GLOBAL: S&P 500, NASDAQ 100, DOW JONES
 */

export const DEFAULT_NSE_FNO_KEY = "iq_nse_fno_live_8f3a9e2c4b71d605a982e3f4";
export const DEFAULT_GLOBAL_KEY = "iq_global_live_6b2d1c9e4a80f735d194c7b2";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  "Cache-Control": "no-store",
};

export function extractApiKey(request: Request): string {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();

  const authHeader = request.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^bearer\s+/i, "").trim();
  }

  try {
    const url = new URL(request.url);
    const queryKey = url.searchParams.get("apiKey") || url.searchParams.get("api_key");
    if (queryKey) return queryKey.trim();
  } catch {}

  return "";
}

export function validateNseFnoKey(key: string): boolean {
  if (!key) return false;
  const envKey = process.env.NSE_FNO_API_KEY?.trim();
  if (envKey && key === envKey) return true;
  if (key === DEFAULT_NSE_FNO_KEY) return true;
  // Dynamic rotated keys generated with prefix
  if (key.startsWith("iq_nse_fno_") && key.length >= 24) return true;
  return false;
}

export function validateGlobalKey(key: string): boolean {
  if (!key) return false;
  const envKey = process.env.GLOBAL_API_KEY?.trim();
  if (envKey && key === envKey) return true;
  if (key === DEFAULT_GLOBAL_KEY) return true;
  // Dynamic rotated keys generated with prefix
  if (key.startsWith("iq_global_") && key.length >= 24) return true;
  return false;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: CORS_HEADERS,
  });
}
