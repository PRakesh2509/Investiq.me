// Server-only Supabase client using the SERVICE ROLE key. It bypasses RLS, so it
// must never be imported from client code and must never be built from a
// publishable/anon key. Created lazily (nothing runs at module load) so it is
// safe on Cloudflare Workers.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Public project URL (not a secret). Used only if no URL env var is provided.
const DEFAULT_SUPABASE_URL = "https://sofhttaxppwkwsrywstt.supabase.co";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New-style opaque keys are not bearer JWTs; send them via `apikey` only.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function readEnv(name: string): string | undefined {
  // `process.env` is populated on Workers via nodejs_compat; guard anyway.
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type ServiceClient = SupabaseClient<Database>;
let _client: ServiceClient | undefined;

function build(): { client: ServiceClient | null; problem?: string } {
  if (_client) return { client: _client };

  const url = readEnv("SUPABASE_URL") ?? readEnv("VITE_SUPABASE_URL") ?? DEFAULT_SUPABASE_URL;
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!key) {
    return {
      client: null,
      problem:
        "SUPABASE_SERVICE_ROLE_KEY is not set. Add it as a server secret " +
        "(e.g. `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`); the service client never falls back to a publishable key.",
    };
  }
  if (key.startsWith("sb_publishable_")) {
    return {
      client: null,
      problem:
        "SUPABASE_SERVICE_ROLE_KEY holds a publishable (anon) key; a service-role/secret key is required.",
    };
  }

  _client = createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return { client: _client };
}

/** Returns the service-role client, or null when the server is not configured. */
export function tryGetServiceClient(): ServiceClient | null {
  return build().client;
}

/** Returns the service-role client or throws an actionable error (never includes key values). */
export function getServiceClient(): ServiceClient {
  const { client, problem } = build();
  if (!client) throw new Error(`[Supabase] ${problem ?? "Service client unavailable."}`);
  return client;
}

/** Lazy proxy kept for existing callers: resolves (or throws) on first property access. */
export const supabaseAdmin: ServiceClient = new Proxy({} as ServiceClient, {
  get(_target, prop) {
    const client = getServiceClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
