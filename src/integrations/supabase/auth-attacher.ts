// Safe client auth attacher that never throws or blocks RPC execution
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      if (supabase && typeof supabase.auth?.getSession === "function") {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) {
          return next({
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    } catch {
      // Never block the RPC on a session lookup failure; the server rejects unauthenticated calls.
    }
    return next({});
  },
);
