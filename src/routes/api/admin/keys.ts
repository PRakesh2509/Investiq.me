import { createFileRoute } from "@tanstack/react-router";
import {
  KEY_PREFIX,
  MIN_MANAGED_KEY_LENGTH,
  getEnvKeys,
  getServiceClient,
  readStoredKeys,
  sha256Hex,
  type KeyScope,
} from "@/lib/api-auth.server";
import { adminJson, requireAdmin, requireAdminMutation } from "@/lib/admin-session.server";

const SCOPES: KeyScope[] = ["nse", "global"];
const STORAGE_UNAVAILABLE =
  "API key storage is not configured on the server (SUPABASE_SERVICE_ROLE_KEY is missing or the api_keys table is unavailable).";

function parseScope(value: unknown): KeyScope | null {
  return value === "nse" || value === "global" ? value : null;
}

export const Route = createFileRoute("/api/admin/keys")({
  server: {
    handlers: {
      /** GET: metadata only. Plaintext keys are never stored or returned. */
      GET: async ({ request }) => {
        const denied = await requireAdmin(request);
        if (denied) return denied;

        const rows = await readStoredKeys(SCOPES);
        const view = (scope: KeyScope) => {
          const row = rows.find((r) => r.scope === scope);
          const envConfigured = getEnvKeys(scope).length > 0;
          return {
            configured: Boolean(row) || envConfigured,
            createdAt: row?.createdAt ?? null,
            lastUsedAt: row?.lastUsedAt ?? null,
            source: row
              ? envConfigured
                ? "database+env"
                : "database"
              : envConfigured
                ? "env"
                : null,
          };
        };
        return adminJson({ nse: view("nse"), global: view("global") });
      },

      /** POST { scope, key }: store sha256(key), replacing the previous key (rotation). */
      POST: async ({ request }) => {
        const denied = await requireAdminMutation(request);
        if (denied) return denied;

        let body: { scope?: unknown; key?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          return adminJson({ ok: false, error: "Invalid JSON body." }, 400);
        }
        const scope = parseScope(body?.scope);
        if (!scope) return adminJson({ ok: false, error: "scope must be 'nse' or 'global'." }, 400);

        const key = typeof body?.key === "string" ? body.key.trim() : "";
        if (!key.startsWith(KEY_PREFIX[scope])) {
          return adminJson(
            { ok: false, error: `Key must start with '${KEY_PREFIX[scope]}'.` },
            400,
          );
        }
        if (key.length < MIN_MANAGED_KEY_LENGTH || key.length > 256 || /\s/.test(key)) {
          return adminJson(
            {
              ok: false,
              error: `Key must be at least ${MIN_MANAGED_KEY_LENGTH} characters with no whitespace.`,
            },
            400,
          );
        }

        const client = await getServiceClient();
        if (!client) return adminJson({ ok: false, error: STORAGE_UNAVAILABLE }, 503);

        const createdAt = new Date().toISOString();
        const { error } = await client.from("api_keys").upsert(
          {
            scope,
            key_hash: await sha256Hex(key),
            created_at: createdAt,
            last_used_at: null,
          },
          { onConflict: "scope" },
        );
        if (error) {
          console.warn("[admin/keys] upsert failed:", error.message);
          return adminJson({ ok: false, error: STORAGE_UNAVAILABLE }, 503);
        }
        return adminJson({ ok: true, createdAt });
      },

      /** DELETE ?scope=nse|global: revoke the stored key. */
      DELETE: async ({ request }) => {
        const denied = await requireAdminMutation(request);
        if (denied) return denied;

        const scope = parseScope(new URL(request.url).searchParams.get("scope"));
        if (!scope) return adminJson({ ok: false, error: "scope must be 'nse' or 'global'." }, 400);

        const client = await getServiceClient();
        if (!client) return adminJson({ ok: false, error: STORAGE_UNAVAILABLE }, 503);

        const { error } = await client.from("api_keys").delete().eq("scope", scope);
        if (error) {
          console.warn("[admin/keys] delete failed:", error.message);
          return adminJson({ ok: false, error: STORAGE_UNAVAILABLE }, 503);
        }
        return adminJson({
          ok: true,
          note:
            getEnvKeys(scope).length > 0
              ? "Stored key revoked. A key from the environment variable remains active until removed from server config."
              : undefined,
        });
      },
    },
  },
});
