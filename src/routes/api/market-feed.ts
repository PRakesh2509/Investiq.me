import { createFileRoute } from "@tanstack/react-router";

/**
 * Returns a short-lived pre-authorized websocket URI for the Upstox market data
 * feed. The access token itself is never sent to the browser.
 */
export const Route = createFileRoute("/api/market-feed")({
  server: {
    handlers: {
      GET: async () => {
        const { getAccessToken, fetchMarketFeedUri, MissingEnvError, UpstoxAuthError } =
          await import("@/lib/upstox.server");
        try {
          const uri = await fetchMarketFeedUri(getAccessToken());
          return Response.json({ ok: true, uri }, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[market-feed]", err.message);
          return Response.json(
            { ok: false, error: err.message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
