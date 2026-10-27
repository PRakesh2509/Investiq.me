import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, searchUnderlyings, MissingEnvError, UpstoxAuthError } =
          await import("@/lib/upstox.server");
        const { safeErrorMessage } = await import("@/lib/provider-utils");
        try {
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
          if (!/^[A-Za-z0-9 &._-]*$/.test(q)) {
            return Response.json(
              { ok: false, error: "q may only contain letters, digits, space, & . _ -" },
              { status: 400 },
            );
          }
          const results = await searchUnderlyings(q, getAccessToken());
          return Response.json({ ok: true, results }, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          const message = safeErrorMessage(err, "search unavailable");
          console.error("[search]", message);
          return Response.json(
            { ok: false, error: message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
