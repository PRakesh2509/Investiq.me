import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdmin, requireAdminMutation } from "@/lib/admin-session.server";
import {
  getDhanCredentials,
  setDhanRuntimeCredentials,
  testDhanConnection,
  writeDhanEnvFile,
  type DhanCredentials,
} from "@/lib/dhan.server";
import { readEnv } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/admin/dhan")({
  server: {
    handlers: {
      /** GET: returns current Dhan configuration and connection status (plaintext token never returned). */
      GET: async ({ request }) => {
        const denied = await requireAdmin(request);
        if (denied) return denied;

        const creds = getDhanCredentials();
        const configuredClientId = creds?.clientId || readEnv("DHAN_CLIENT_ID") || "1114340693";
        const hasToken = Boolean(creds?.accessToken && creds.accessToken.trim().length > 0);
        const mask = (id: string) => (id.length > 4 ? `${id.slice(0, 3)}****${id.slice(-3)}` : id);

        return adminJson({
          ok: true,
          configured: hasToken,
          clientId: configuredClientId,
          maskedClientId: mask(configuredClientId),
          hasToken,
          feedSource: hasToken ? "DhanHQ Live Direct Feed v2" : "NSE Live Feed (DhanHQ Offline)",
        });
      },

      /** POST: updates runtime credentials and optionally tests connection with DhanHQ. */
      POST: async ({ request }) => {
        const denied = await requireAdminMutation(request);
        if (denied) return denied;

        let body: { clientId?: string; accessToken?: string; action?: "test" | "save" } = {};
        try {
          body = await request.json();
        } catch {
          return adminJson({ ok: false, error: "Invalid JSON body." }, 400);
        }

        const clientId =
          (typeof body.clientId === "string" ? body.clientId.trim() : "") ||
          readEnv("DHAN_CLIENT_ID") ||
          "1114340693";
        const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

        if (!accessToken) {
          return adminJson({ ok: false, error: "Dhan Access Token cannot be empty." }, 400);
        }

        const creds: DhanCredentials = { clientId, accessToken };

        // Test connection with DhanHQ
        const testStart = Date.now();
        const test = await testDhanConnection(creds);
        const latencyMs = Date.now() - testStart;

        // If the user just wanted to test without saving
        if (body.action === "test") {
          return adminJson({
            ok: test.ok,
            message:
              test.message ||
              (test.ok ? "Connected to DhanHQ successfully" : "Authentication failed"),
            latencyMs,
          });
        }

        // Action is "save" or default:
        // Update runtime in-memory credentials + globalThis
        setDhanRuntimeCredentials(creds);
        if (typeof process !== "undefined" && process.env) {
          process.env.DHAN_CLIENT_ID = creds.clientId;
          process.env.DHAN_ACCESS_TOKEN = creds.accessToken;
        }

        // Local development: also write into .env file
        await writeDhanEnvFile(creds);

        return adminJson({
          ok: true,
          verified: test.ok,
          message: test.ok
            ? `DhanHQ account connected! Direct live feed is active (${latencyMs}ms).`
            : `DhanHQ credentials saved. Note: DhanHQ server returned: "${test.message}". (Tokens expire every 24 hours).`,
          feedSource: "DhanHQ Live Direct Feed v2",
          latencyMs,
        });
      },

      /** DELETE: clears active Dhan credentials and reverts to fallback feed. */
      DELETE: async ({ request }) => {
        const denied = await requireAdminMutation(request);
        if (denied) return denied;

        setDhanRuntimeCredentials(null);
        if (typeof process !== "undefined" && process.env) {
          process.env.DHAN_ACCESS_TOKEN = "";
        }
        await writeDhanEnvFile(null);

        return adminJson({
          ok: true,
          message: "DhanHQ Access Token cleared. Reverted to NSE Live Fallback feed.",
          feedSource: "NSE Live Feed (DhanHQ Offline)",
        });
      },
    },
  },
});
