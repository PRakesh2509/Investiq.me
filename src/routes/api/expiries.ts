import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/expiries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, fetchExpiries, MissingEnvError, UpstoxAuthError } = await import(
          "@/lib/upstox.server"
        );
        try {
          const url = new URL(request.url);
          const instrumentKey = url.searchParams.get("instrument_key");
          if (!instrumentKey) {
            return Response.json(
              { ok: false, error: "instrument_key is required" },
              { status: 400 },
            );
          }
          const expiries = await fetchExpiries(instrumentKey, getAccessToken());
          return Response.json(
            { ok: true, expiries },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[expiries]", err.message);
          return Response.json(
            { ok: false, error: err.message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
