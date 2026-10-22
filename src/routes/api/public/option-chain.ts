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
 */

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "x-api-key,authorization,content-type",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS });

function presentedKey(request: Request): string {
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  const url = new URL(request.url);
  return (url.searchParams.get("api_key") ?? "").trim();
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

        const allowed = (process.env["OPTION_CHAIN_API_KEY"] ?? "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        if (!allowed.length) {
          return json({ ok: false, error: "API key not configured" }, 200);
        }
        const key = presentedKey(request);
        if (!key || !allowed.includes(key)) {
          return json({ ok: false, error: "Invalid or missing API key" }, 401);
        }

        try {
          const url = new URL(request.url);
          const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
          let instrumentKey = url.searchParams.get("instrument_key") ?? "";

          if (!instrumentKey && symbol) {
            const match = INDEX_UNDERLYINGS.find((u) => u.label === symbol);
            if (!match) {
              return json(
                {
                  ok: false,
                  error: `Unknown symbol "${symbol}"`,
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

          const token = getAccessToken();
          const expiries = await fetchExpiries(instrumentKey, token);
          const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
          const requested = url.searchParams.get("expiry");
          const expiry = requested || expiries.find((e) => e >= today) || expiries[0];
          if (!expiry) {
            return json({ ok: false, error: "No expiries available for this instrument" }, 404);
          }

          const chain = await fetchOptionChain(instrumentKey, expiry, token);
          return json({ ok: true, expiries, chain });
        } catch (e) {
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          console.error("[public/option-chain]", err.message);
          return json(
            { ok: false, error: err.message, tokenExpired, missing },
            tokenExpired ? 401 : 500,
          );
        }
      },
    },
  },
});
