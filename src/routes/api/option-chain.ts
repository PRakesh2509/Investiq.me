import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/option-chain")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, fetchOptionChain, MissingEnvError, UpstoxAuthError } =
          await import("@/lib/upstox.server");
        const {
          isValidExpiry,
          isValidInstrumentKey,
          safeErrorMessage,
          classifyFreshness,
          isMarketOpenAt,
        } = await import("@/lib/provider-utils");
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
          if (!isValidInstrumentKey(instrumentKey)) {
            return Response.json({ ok: false, error: "invalid instrument_key" }, { status: 400 });
          }
          if (!isValidExpiry(expiry)) {
            return Response.json(
              { ok: false, error: "invalid expiry (expected YYYY-MM-DD)" },
              { status: 400 },
            );
          }
          const chain = await fetchOptionChain(instrumentKey, expiry, getAccessToken());
          const now = Date.now();
          const marketOpen = isMarketOpenAt(new Date(now), false);
          const freshnessStatus = chain.stale
            ? marketOpen
              ? "STALE"
              : "MARKET_CLOSED"
            : classifyFreshness({
                asOfMs: chain.generatedAt,
                nowMs: now,
                marketOpen,
                feed: "realtime",
              });
          return Response.json(
            { ok: true, chain, dataSource: "upstox", isSimulated: false, freshnessStatus },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          if (e instanceof RangeError) {
            return Response.json({ ok: false, error: e.message }, { status: 400 });
          }
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          const message = safeErrorMessage(err, "option chain unavailable");
          console.error("[option-chain]", message);
          return Response.json(
            { ok: false, error: message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
