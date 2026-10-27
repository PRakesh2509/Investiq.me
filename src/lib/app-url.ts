/**
 * Single source of truth for the public production base URL (Cloudflare Workers).
 *
 * Server: PROD_URL. Browser: VITE_PROD_URL. Falls back to the deployed worker so links,
 * webhooks and curl examples never point at a stale host.
 */

export const DEFAULT_PROD_URL = "https://investiq-me.rakeshpavuluri999.workers.dev";

function clean(url: string | undefined | null): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

export function getAppBaseUrl(): string {
  const serverEnv =
    typeof process !== "undefined" && process.env ? clean(process.env.PROD_URL) : "";
  if (serverEnv) return serverEnv;

  const viteEnv = clean(import.meta.env?.VITE_PROD_URL as string | undefined);
  if (viteEnv) return viteEnv;

  return DEFAULT_PROD_URL;
}

/** Absolute URL on the production backend, e.g. appUrl("/api/v1/trades/auto"). */
export function appUrl(path = ""): string {
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${getAppBaseUrl()}${suffix}`;
}
