import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, searchUnderlyings, MissingEnvError, UpstoxAuthError } = await import(
          "@/lib/upstox.server"
        );
        try {
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") ?? "").slice(0, 40);
          const results = await searchUnderlyings(q, getAccessToken());
          return Response.json(
            { ok: true, results },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[search]", err.message);
          return Response.json(
            { ok: false, error: err.message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
