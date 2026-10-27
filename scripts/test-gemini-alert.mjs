#!/usr/bin/env node
/**
 * Trigger the production Gemini trade-alert test (AI premium trades -> Telegram).
 *
 * Calls POST {PROD_URL}/api/test-trade with the shared CRON_SECRET. Gemini and Telegram
 * credentials live on the server only; this script never reads or prints them.
 *
 * Usage:
 *   PROD_URL=https://your-worker.example.workers.dev CRON_SECRET=... \
 *     node scripts/test-gemini-alert.mjs [NIFTY|BANKNIFTY|SENSEX]
 *
 * PROD_URL and CRON_SECRET are read from the environment (or from a local .env file).
 */
import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    [
      "Usage:",
      "  PROD_URL=<https://host> CRON_SECRET=<secret> node scripts/test-gemini-alert.mjs [SYMBOL]",
      "",
      "  SYMBOL   NIFTY (default), BANKNIFTY or SENSEX",
      "",
      "Environment:",
      "  PROD_URL     base URL of the deployed app (no trailing slash needed)",
      "  CRON_SECRET  shared secret, sent as the x-cron-secret header",
    ].join("\n"),
  );
  process.exit(message ? 1 : 0);
}

loadDotEnv();

if (process.argv.includes("--help") || process.argv.includes("-h")) usage();

const prodUrl = (process.env.PROD_URL ?? "").trim().replace(/\/+$/, "");
const cronSecret = (process.env.CRON_SECRET ?? "").trim();
if (!prodUrl) usage("PROD_URL is not set.");
if (!cronSecret) usage("CRON_SECRET is not set.");

const symbol = (process.argv[2] ?? "NIFTY").toUpperCase();
console.log(`POST ${prodUrl}/api/test-trade  symbol=${symbol}`);

let res;
try {
  res = await fetch(`${prodUrl}/api/test-trade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ symbol }),
    signal: AbortSignal.timeout(120_000),
  });
} catch (e) {
  console.error(`Request failed: ${e.message}`);
  process.exit(1);
}

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 500));
  process.exit(1);
}

console.log(`HTTP ${res.status}`);
if (body.plan) {
  console.log(`Symbol: ${body.symbol}  Expiry: ${body.expiry}  Simulated: ${body.simulated}`);
  console.log(`Market view: ${body.plan.marketView}`);
  console.log(`Trades generated: ${body.plan.trades?.length ?? 0}`);
  console.log(`Telegram: ${body.notified?.sent ?? 0}/${body.notified?.total ?? 0} delivered`);
  if (body.errors?.length) console.log(`Fallbacks used: ${body.errors.join("; ")}`);
} else {
  console.log(JSON.stringify(body, null, 2));
}
if (res.status === 401) console.error("Unauthorized: check that CRON_SECRET matches the server's.");
if (res.status === 503) console.error("Server has no CRON_SECRET configured (endpoint disabled).");
process.exit(res.ok && body.ok !== false ? 0 : 1);
