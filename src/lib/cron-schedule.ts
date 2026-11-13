/**
 * Cloudflare Cron Trigger schedule -> alert hook mapping.
 *
 * Cloudflare evaluates cron expressions in UTC, so every entry documents its IST (UTC+5:30)
 * equivalent. The expressions here MUST match `triggers.crons` in wrangler.jsonc exactly
 * (enforced by src/lib/__tests__/cron-schedule.test.ts).
 *
 * Kept free of app/runtime imports so it can be unit-tested with plain `node --test`.
 */

export type CronJob = {
  /** Cron expression (UTC). */
  cron: string;
  /** Human description including the IST equivalent. */
  description: string;
  /** Hook paths (all POST) invoked in order when the trigger fires. */
  hooks: string[];
};

export const CRON_SECRET_HEADER = "x-cron-secret";

const HOOK_BASE = "/api/public/hooks";

export const CRON_JOBS: readonly CronJob[] = [
  {
    cron: "30 3 * * 1-5",
    description: "Pre-market top-gainers alert - 09:00 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/premarket-alert`],
  },
  {
    cron: "0 4 * * 1",
    description: "Mutual Fund digest - weekly, Monday 09:30 IST only",
    hooks: [`${HOOK_BASE}/funds-alert`],
  },
  {
    cron: "0 4 * * 1-5",
    description: "IPO alerts (morning check) - 09:30 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/ipo-alert`],
  },
  {
    cron: "15 6 * * 1-5",
    description: "Daily RSI alerts - 11:45 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/rsi-alert`],
  },
  {
    cron: "0 8 * * 1-5",
    description: "IPO alerts (afternoon check) - 13:30 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/ipo-alert`],
  },
  {
    cron: "45 10 * * 1-5",
    description: "Post-market summary - 16:15 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/postmarket-alert`],
  },
  {
    cron: "0 11 * * 1-5",
    description: "Post-market sectors - 16:30 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/postmarket-alert`],
  },
  {
    cron: "15 11 * * 1-5",
    description: "Post-market trending - 16:45 IST, Mon-Fri",
    hooks: [`${HOOK_BASE}/postmarket-alert`],
  },
  {
    // 03:00-10:50 UTC = 08:30-16:20 IST (covers NSE 09:15-15:30; hook skips outside hours)
    cron: "*/10 3-10 * * 1-5",
    description: "Stock & ETF news - every 10 min during market hours, Mon-Fri",
    hooks: [`${HOOK_BASE}/news-alert`],
  },
  {
    // The hook itself returns {skipped:true} outside 09:15-15:30 IST.
    cron: "*/15 3-10 * * 1-5",
    description: "F&O sniper trade alerts - every 15 min during market hours, Mon-Fri",
    hooks: [`${HOOK_BASE}/ai-trade-alert`],
  },
];

export function cronExpressions(): string[] {
  return CRON_JOBS.map((job) => job.cron);
}

export function hooksForCron(cron: string): string[] {
  return CRON_JOBS.find((job) => job.cron === cron)?.hooks ?? [];
}

export type CronHookResult = { hook: string; status: number; ok: boolean; error?: string };

export type RunCronOptions = {
  /** Value for the x-cron-secret header (env.CRON_SECRET). */
  secret?: string;
  /** Builds an absolute URL for a hook path (use appUrl()). */
  urlFor: (path: string) => string;
  /** The app's own fetch handler - no network hop. */
  dispatch: (request: Request) => Promise<Response> | Response;
  log?: Pick<Console, "error" | "warn" | "info">;
};

/** Runs every hook mapped to `cron` sequentially; one failing hook never blocks the others. */
export async function runCronHooks(
  cron: string,
  { secret, urlFor, dispatch, log = console }: RunCronOptions,
): Promise<CronHookResult[]> {
  const hooks = hooksForCron(cron);
  if (hooks.length === 0) {
    log.warn(`[cron] no hooks mapped for "${cron}"`);
    return [];
  }
  if (!secret) {
    log.warn("[cron] CRON_SECRET is not set; hooks that require it will reject this call");
  }

  const results: CronHookResult[] = [];
  for (const hook of hooks) {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (secret) headers[CRON_SECRET_HEADER] = secret;
      const response = await dispatch(
        new Request(urlFor(hook), { method: "POST", headers, body: "{}" }),
      );
      // Drain the body so the connection/stream is released.
      await response.text().catch(() => "");
      results.push({ hook, status: response.status, ok: response.ok });
      if (!response.ok) log.error(`[cron] ${hook} responded ${response.status}`);
    } catch (error) {
      log.error(`[cron] ${hook} failed`, error);
      results.push({
        hook,
        status: 0,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
