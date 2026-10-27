import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CRON_JOBS,
  CRON_SECRET_HEADER,
  cronExpressions,
  hooksForCron,
  runCronHooks,
} from "../cron-schedule.ts";

function readWranglerCrons(): string[] {
  const raw = readFileSync(new URL("../../../wrangler.jsonc", import.meta.url), "utf8");
  // Strip whole-line // comments and trailing commas (jsonc).
  const json = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
  return (JSON.parse(json) as { triggers: { crons: string[] } }).triggers.crons;
}

test("cron expressions in wrangler.jsonc match CRON_JOBS", () => {
  assert.deepEqual([...readWranglerCrons()].sort(), [...cronExpressions()].sort());
});

test("every cron expression is unique and maps to at least one existing hook path", () => {
  assert.equal(new Set(cronExpressions()).size, CRON_JOBS.length);
  for (const job of CRON_JOBS) {
    assert.ok(job.hooks.length > 0);
    for (const hook of job.hooks) assert.match(hook, /^\/api\/public\/hooks\/[a-z-]+$/);
  }
});

test("runCronHooks POSTs each hook with the secret header and survives failures", async () => {
  const cron = "15 6 * * 1-5";
  const seen: Array<{ url: string; method: string; secret: string | null }> = [];
  const results = await runCronHooks(cron, {
    secret: "s3cret",
    urlFor: (path) => `https://example.test${path}`,
    log: { error() {}, warn() {}, info() {} },
    dispatch: async (request) => {
      seen.push({
        url: request.url,
        method: request.method,
        secret: request.headers.get(CRON_SECRET_HEADER),
      });
      if (request.url.endsWith("funds-alert")) throw new Error("boom");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(
    seen.map((s) => s.url),
    hooksForCron(cron).map((p) => `https://example.test${p}`),
  );
  assert.ok(seen.every((s) => s.method === "POST" && s.secret === "s3cret"));
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, false, true],
  );
});

test("runCronHooks ignores unknown cron expressions", async () => {
  const results = await runCronHooks("* * * * *", {
    urlFor: (p) => p,
    dispatch: () => assert.fail("must not dispatch"),
    log: { error() {}, warn() {}, info() {} },
  });
  assert.deepEqual(results, []);
});
