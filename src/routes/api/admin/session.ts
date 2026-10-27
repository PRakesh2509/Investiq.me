import { createFileRoute } from "@tanstack/react-router";
import {
  ADMIN_NOT_CONFIGURED_MESSAGE,
  LOGIN_FAILURE_DELAY_MS,
  adminJson,
  buildClearCookie,
  buildSessionCookie,
  clientIp,
  createSessionToken,
  getAdminConfig,
  isAdminRequest,
  isLocalhostRequest,
  isSameOrigin,
  loginRateLimiter,
  verifyCredentials,
} from "@/lib/admin-session.server";

const MAX_BODY_CHARS = 4096;

export const Route = createFileRoute("/api/admin/session")({
  server: {
    handlers: {
      /** GET: report whether the caller currently holds a valid admin session. Never 401. */
      GET: async ({ request }) => {
        return adminJson({ ok: true, isAdmin: await isAdminRequest(request) });
      },

      /** POST { username, password }: start an admin session. */
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) {
          return adminJson({ ok: false, error: "Cross-origin request rejected." }, 403);
        }

        const cfg = getAdminConfig();
        if (!cfg) return adminJson({ ok: false, error: ADMIN_NOT_CONFIGURED_MESSAGE }, 503);

        const ip = clientIp(request);
        const retryAfter = loginRateLimiter.blockedFor(ip);
        if (retryAfter > 0) {
          return adminJson(
            { ok: false, error: "Too many failed attempts. Try again later." },
            429,
            { "Retry-After": String(retryAfter) },
          );
        }

        let username = "";
        let password = "";
        try {
          const text = await request.text();
          if (text.length <= MAX_BODY_CHARS) {
            const body = JSON.parse(text) as { username?: unknown; password?: unknown };
            if (typeof body?.username === "string") username = body.username;
            if (typeof body?.password === "string") password = body.password;
          }
        } catch {
          // fall through: treated as invalid credentials
        }

        const valid = await verifyCredentials(cfg, username, password);
        if (!valid) {
          loginRateLimiter.recordFailure(ip);
          await new Promise((resolve) => setTimeout(resolve, LOGIN_FAILURE_DELAY_MS));
          return adminJson({ ok: false, error: "Invalid username or password." }, 401);
        }

        loginRateLimiter.reset(ip);
        const token = await createSessionToken(cfg);
        return adminJson({ ok: true }, 200, {
          "Set-Cookie": buildSessionCookie(token, { secure: !isLocalhostRequest(request) }),
        });
      },

      /** DELETE: end the session (clear the cookie). */
      DELETE: async ({ request }) => {
        if (!isSameOrigin(request)) {
          return adminJson({ ok: false, error: "Cross-origin request rejected." }, 403);
        }
        return adminJson({ ok: true }, 200, {
          "Set-Cookie": buildClearCookie({ secure: !isLocalhostRequest(request) }),
        });
      },
    },
  },
});
