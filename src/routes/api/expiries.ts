import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/expiries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, fetchExpiries, MissingEnvError, UpstoxAuthError } =
          await import("@/lib/upstox.server");
        const { isValidInstrumentKey, safeErrorMessage } = await import("@/lib/provider-utils");
        try {
          const url = new URL(request.url);
          const instrumentKey = url.searchParams.get("instrument_key");
          if (!instrumentKey) {
            return Response.json(
              { ok: false, error: "instrument_key is required" },
              { status: 400 },
            );
          }
          if (!isValidInstrumentKey(instrumentKey)) {
            return Response.json({ ok: false, error: "invalid instrument_key" }, { status: 400 });
          }
          const expiries = await fetchExpiries(instrumentKey, getAccessToken());
          return Response.json(
            { ok: true, expiries, dataSource: "upstox", isSimulated: false },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          if (e instanceof RangeError) {
            return Response.json({ ok: false, error: e.message }, { status: 400 });
          }
          const err = e as Error;
          const tokenExpired = err instanceof UpstoxAuthError;
          const missing = err instanceof MissingEnvError ? err.missing : undefined;
          const message = safeErrorMessage(err, "expiries unavailable");
          console.error("[expiries]", message);
          return Response.json(
            { ok: false, error: message, tokenExpired, missing },
            { status: tokenExpired ? 401 : 500 },
          );
        }
      },
    },
  },
});
