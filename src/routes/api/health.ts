import { createFileRoute } from "@tanstack/react-router";

/**
 * Health check endpoint.
 * Public, no authentication required.
 * Returns: {"ok": true}
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      },
      HEAD: async () => {
        return new Response(null, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      GET: async () => {
        return Response.json(
          { ok: true },
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      },
    },
  },
});

