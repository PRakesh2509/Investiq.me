/**
 * Race-safe "send once" dedupe for alert hooks (news_sent, ipo_sent, ai_trade_sent).
 *
 * claimOnce() is insert-first: the unique key on the table decides the winner, so two
 * concurrent runs can never both claim the same item (no read-then-write window).
 * One row per call, so a single duplicate never fails a whole batch.
 *
 * If the service-role client is not configured (or the table is unreachable) we
 * degrade LOUDLY: log an error, report "unavailable" to the caller, and fall back to a
 * best-effort in-isolate Set so a single worker does not repeat itself every run.
 */

export type ClaimResult = "claimed" | "duplicate" | "unavailable";

type LooseClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{
      error: { code?: string; message?: string } | null;
    }>;
    delete: () => {
      match: (m: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
    };
    select: (cols: string) => {
      in: (
        col: string,
        values: string[],
      ) => PromiseLike<{
        data: Record<string, unknown>[] | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

const memory = new Set<string>();
const MEMORY_MAX = 2000;
let warnedUnavailable = false;

function remember(key: string) {
  if (memory.size >= MEMORY_MAX) memory.clear();
  memory.add(key);
}

async function getClient(): Promise<LooseClient | null> {
  try {
    const { tryGetServiceClient } = await import("@/integrations/supabase/client.server");
    return tryGetServiceClient() as unknown as LooseClient | null;
  } catch (e) {
    console.error("[hook-dedupe] service client import failed:", (e as Error).message);
    return null;
  }
}

function warnOnce(reason: string) {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.error(
    `[hook-dedupe] DEDUPE UNAVAILABLE (${reason}); sending without durable dedupe. ` +
      "Set SUPABASE_SERVICE_ROLE_KEY to enable it.",
  );
}

/**
 * Try to claim `row` in `table`. `memoryKey` identifies the item for the fallback cache.
 * "claimed"/"unavailable" => caller should send; "duplicate" => already sent, skip.
 */
export async function claimOnce(
  table: "news_sent" | "ipo_sent" | "ai_trade_sent",
  row: Record<string, unknown>,
  memoryKey: string,
): Promise<ClaimResult> {
  const mkey = `${table}:${memoryKey}`;
  const client = await getClient();
  if (!client) {
    warnOnce("service client not configured");
    if (memory.has(mkey)) return "duplicate";
    remember(mkey);
    return "unavailable";
  }
  try {
    const { error } = await client.from(table).insert(row);
    if (!error) {
      remember(mkey);
      return "claimed";
    }
    if (error.code === "23505" || /duplicate key/i.test(error.message ?? "")) {
      remember(mkey);
      return "duplicate";
    }
    warnOnce(`${table} insert failed: ${error.message ?? "unknown"}`);
  } catch (e) {
    warnOnce(`${table} insert threw: ${(e as Error).message}`);
  }
  if (memory.has(mkey)) return "duplicate";
  remember(mkey);
  return "unavailable";
}

/** Undo a claim after a failed delivery so the next run retries. Never throws. */
export async function releaseClaim(
  table: "news_sent" | "ipo_sent" | "ai_trade_sent",
  match: Record<string, unknown>,
  memoryKey: string,
): Promise<void> {
  memory.delete(`${table}:${memoryKey}`);
  try {
    const client = await getClient();
    if (!client) return;
    const { error } = await client.from(table).delete().match(match);
    if (error) console.error(`[hook-dedupe] release ${table} failed:`, error.message);
  } catch (e) {
    console.error(`[hook-dedupe] release ${table} threw:`, (e as Error).message);
  }
}

/** Optional read-side optimisation: which of `values` are already recorded. Empty set on any failure. */
export async function alreadySent(
  table: "news_sent" | "ipo_sent",
  column: "guid" | "ipo_id",
  values: string[],
): Promise<Set<string>> {
  const seen = new Set<string>();
  if (!values.length) return seen;
  for (const v of values) if (memory.has(`${table}:${v}`)) seen.add(v);
  try {
    const client = await getClient();
    if (!client) return seen;
    const { data, error } = await client.from(table).select(column).in(column, values);
    if (error) {
      console.error(`[hook-dedupe] read ${table} failed:`, error.message);
      return seen;
    }
    for (const r of data ?? []) seen.add(String(r[column]));
  } catch (e) {
    console.error(`[hook-dedupe] read ${table} threw:`, (e as Error).message);
  }
  return seen;
}
