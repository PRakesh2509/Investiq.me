import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/option-chain")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, fetchOptionChain, MissingEnvError, UpstoxAuthError } = await import(
          "@/lib/upstox.server"
        );
        try {
          const url = new URL(request.url);
          const instrumentKey = url.searchParams.get("instrument_key");
          const expiry = url.searchParams.get("expiry");
          if (!instrumentKey || !expiry) {
            return Response.json(
              { ok: false, error: "instrument_key and expiry are required" },
              { status: 400 },
            );
          }
          const chain = await fetchOptionChain(instrumentKey, expiry, getAccessToken());
          return Response.json({ ok: true, chain }, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[option-chain]", err.message);
          return Response.json(
            { ok: false, error: err.message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
