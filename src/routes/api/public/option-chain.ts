import { createFileRoute } from "@tanstack/react-router";

/**
 * Public, API-key protected real-time option chain.
 *
 * GET /api/public/option-chain?symbol=NIFTY[&expiry=YYYY-MM-DD]
 * GET /api/public/option-chain?instrument_key=NSE_INDEX|Nifty 50&expiry=YYYY-MM-DD
 *
 * Auth: `x-api-key: <key>` or `Authorization: Bearer <key>`
 * (checked against the OPTION_CHAIN_API_KEY secret; comma-separated list allowed).
 * CORS is open so any external site can call it with the key.
 *
 * Data comes from the authorized Upstox feed only; the response carries `dataSource`,
 * `isSimulated` and `freshnessStatus` so consumers can tell how current it is.
 */

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "x-api-key,authorization,content-type",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

function presentedKey(request: Request): string {
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  const url = new URL(request.url);
  return (url.searchParams.get("api_key") ?? "").trim();
}

/** Length-independent, constant-time-ish comparison (avoids early exit on first mismatch). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/option-chain")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const {
          getAccessToken,
          fetchOptionChain,
          fetchExpiries,
          INDEX_UNDERLYINGS,
          MissingEnvError,
          UpstoxAuthError,
        } = await import("@/lib/upstox.server");
        const {
          classifyFreshness,
          isMarketOpenAt,
          isValidExpiry,
          isValidInstrumentKey,
          pickNearestExpiry,
          safeErrorMessage,
        } = await import("@/lib/provider-utils");

        const allowed = (process.env["OPTION_CHAIN_API_KEY"] ?? "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        if (!allowed.length) {
          return json({ ok: false, error: "API key not configured" }, 503);
        }
        const key = presentedKey(request);
        // Evaluate every candidate so timing does not reveal which entry matched.
        const keyOk = allowed.reduce((ok, k) => safeEqual(k, key) || ok, false);
        if (!key || !keyOk) {
          return json({ ok: false, error: "Invalid or missing API key" }, 401);
        }

        try {
          const url = new URL(request.url);
          const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase().slice(0, 32);
          let instrumentKey = url.searchParams.get("instrument_key") ?? "";

          if (!instrumentKey && symbol) {
            const match = INDEX_UNDERLYINGS.find((u) => u.label === symbol);
            if (!match) {
              return json(
                {
                  ok: false,
                  error: `Unknown symbol "${symbol.replace(/[^A-Z0-9 &._-]/g, "")}"`,
                  supported: INDEX_UNDERLYINGS.map((u) => u.label),
                },
                400,
              );
            }
            instrumentKey = match.key;
          }
          if (!instrumentKey) {
            return json(
              {
                ok: false,
                error: "symbol or instrument_key is required",
                supported: INDEX_UNDERLYINGS.map((u) => u.label),
              },
              400,
            );
          }
          if (!isValidInstrumentKey(instrumentKey)) {
            return json({ ok: false, error: "invalid instrument_key" }, 400);
          }
          const requested = url.searchParams.get("expiry");
          if (requested && !isValidExpiry(requested)) {
            return json({ ok: false, error: "invalid expiry (expected YYYY-MM-DD)" }, 400);
          }

          const token = getAccessToken();
          const expiries = await fetchExpiries(instrumentKey, token);
          const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
          const expiry = requested || pickNearestExpiry(expiries, today);
          if (!expiry) {
            return json({ ok: false, error: "No expiries available for this instrument" }, 404);
          }

          const chain = await fetchOptionChain(instrumentKey, expiry, token);
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
          return json({
            ok: true,
            expiries,
            chain,
            dataSource: "upstox",
            isSimulated: false,
            freshnessStatus,
          });
        } catch (e) {
          if (e instanceof RangeError) {
            return json({ ok: false, error: e.message }, 400);
          }
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          const message = safeErrorMessage(err, "option chain unavailable");
          console.error("[public/option-chain]", message);
          return json(
            { ok: false, error: message, tokenExpired, missing },
            tokenExpired ? 401 : 500,
          );
        }
      },
    },
  },
});
