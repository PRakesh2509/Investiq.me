import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Route as HealthRoute } from "../../routes/api/health.ts";
import { Route as SignalsRoute } from "../../routes/api/signals.ts";
import { recordSignal, clearRecordedSignals, createSignalsRateLimiter } from "../signals-api.server.ts";

describe("API Routes Handlers - End to End", () => {
  const TEST_KEY = "iq_live_test_api_key_for_handlers_1234567890abcdef";

  test("GET /api/health returns { ok: true } without authentication", async () => {
    const handler = (HealthRoute.options as any).server?.handlers?.GET;
    assert.ok(handler, "GET handler must exist on HealthRoute");

    const req = new Request("https://www.investiqq.me/api/health", { method: "GET" });
    const res: Response = await handler({ request: req });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { ok: true });
  });

  test("GET /api/signals returns 401 when x-api-key is missing", async () => {
    const handler = (SignalsRoute.options as any).server?.handlers?.GET;
    assert.ok(handler, "GET handler must exist on SignalsRoute");

    const req = new Request("https://www.investiqq.me/api/signals", { method: "GET" });
    const res: Response = await handler({ request: req });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /Missing API key/);
  });

  test("GET /api/signals returns 401 when x-api-key is invalid", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    const handler = (SignalsRoute.options as any).server?.handlers?.GET;

    const req = new Request("https://www.investiqq.me/api/signals", {
      method: "GET",
      headers: { "x-api-key": "iq_live_wrong_invalid_key_99999" },
    });
    const res: Response = await handler({ request: req });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /Invalid API key/);
  });

  test("GET /api/signals returns 400 for invalid market query parameter", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    const handler = (SignalsRoute.options as any).server?.handlers?.GET;

    const req = new Request("https://www.investiqq.me/api/signals?market=CRYPTO", {
      method: "GET",
      headers: { "x-api-key": TEST_KEY },
    });
    const res: Response = await handler({ request: req });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /Invalid market/);
  });

  test("GET /api/signals returns 400 for invalid since query parameter", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    const handler = (SignalsRoute.options as any).server?.handlers?.GET;

    const req = new Request("https://www.investiqq.me/api/signals?since=not-a-date", {
      method: "GET",
      headers: { "x-api-key": TEST_KEY },
    });
    const res: Response = await handler({ request: req });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /Invalid 'since'/);
  });

  test("GET /api/signals returns 200 with { signals: [...] } when authenticated", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    clearRecordedSignals();

    recordSignal({
      id: "sig_india_test_banknifty_1",
      market: "INDIA_FNO",
      instrument: "BANKNIFTY",
      instrument_type: "OPTION",
      expiry: "2026-11-06",
      strike: 52000,
      option_type: "CE",
      side: "BUY",
      lots: 1,
      price: 245.5,
      stop_loss: 191.49,
      target: 326.5,
      currency: "INR",
      created_at: "2026-10-31T09:15:00.000Z",
    });

    recordSignal({
      id: "sig_us_test_spx_1",
      market: "US_FNO",
      instrument: "SPX",
      instrument_type: "OPTION",
      expiry: "2026-11-06",
      strike: 5800,
      option_type: "CE",
      side: "BUY",
      lots: 1,
      price: 48.0,
      stop_loss: 38.0,
      target: 65.0,
      currency: "USD",
      created_at: "2026-10-31T14:30:00.000Z",
    });

    const handler = (SignalsRoute.options as any).server?.handlers?.GET;

    // 1. All signals
    const reqAll = new Request("https://www.investiqq.me/api/signals", {
      method: "GET",
      headers: { "x-api-key": TEST_KEY },
    });
    const resAll: Response = await handler({ request: reqAll });
    assert.strictEqual(resAll.status, 200);
    const bodyAll = await resAll.json();
    assert.ok(Array.isArray(bodyAll.signals));
    assert.ok(bodyAll.signals.some((s: any) => s.id === "sig_india_test_banknifty_1"));
    assert.ok(bodyAll.signals.some((s: any) => s.id === "sig_us_test_spx_1"));

    // 2. India only
    const reqIndia = new Request("https://www.investiqq.me/api/signals?market=INDIA_FNO", {
      method: "GET",
      headers: { "x-api-key": TEST_KEY },
    });
    const resIndia: Response = await handler({ request: reqIndia });
    assert.strictEqual(resIndia.status, 200);
    const bodyIndia = await resIndia.json();
    assert.ok(bodyIndia.signals.every((s: any) => s.market === "INDIA_FNO"));
    assert.ok(bodyIndia.signals.some((s: any) => s.id === "sig_india_test_banknifty_1"));
    assert.ok(!bodyIndia.signals.some((s: any) => s.id === "sig_us_test_spx_1"));

    // 3. US only
    const reqUS = new Request("https://www.investiqq.me/api/signals?market=US_FNO", {
      method: "GET",
      headers: { "x-api-key": TEST_KEY },
    });
    const resUS: Response = await handler({ request: reqUS });
    assert.strictEqual(resUS.status, 200);
    const bodyUS = await resUS.json();
    assert.ok(bodyUS.signals.every((s: any) => s.market === "US_FNO"));
    assert.ok(bodyUS.signals.some((s: any) => s.id === "sig_us_test_spx_1"));
    assert.ok(!bodyUS.signals.some((s: any) => s.id === "sig_india_test_banknifty_1"));
  });
});
