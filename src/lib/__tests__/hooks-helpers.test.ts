import test from "node:test";
import assert from "node:assert/strict";

import {
  constantTimeEqual,
  evaluateCronAuth,
  evaluateWebhookAuth,
  extractProvidedSecret,
  isLocalHostname,
  requireCronAuth,
  resolveAccess,
} from "../cron-auth.server.ts";
import {
  PERMANENT_CHAT_IDS,
  TELEGRAM_MAX_LEN,
  chunkMessage,
  escapeHtml,
  htmlToPlainText,
  parseChatIds,
  redactSecrets,
  resolveChatIds,
  sendMessage,
  sendToMany,
} from "../telegram.server.ts";
import { derivePrevClose, quoteFromChart, toYahooSymbol } from "../yahoo.server.ts";

/* ------------------------------- cron-auth -------------------------------- */

test("constantTimeEqual compares strings exactly", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
  assert.equal(constantTimeEqual("", ""), true);
  assert.equal(constantTimeEqual("", "x"), false);
  assert.equal(constantTimeEqual("héllo", "héllo"), true);
});

test("extractProvidedSecret reads x-cron-secret then Bearer", () => {
  assert.equal(extractProvidedSecret(new Headers({ "x-cron-secret": " s3 " })), "s3");
  assert.equal(extractProvidedSecret(new Headers({ authorization: "Bearer tok" })), "tok");
  assert.equal(extractProvidedSecret(new Headers({ authorization: "bearer tok" })), "tok");
  assert.equal(extractProvidedSecret(new Headers({ authorization: "Basic abc" })), "");
  assert.equal(extractProvidedSecret(new Headers()), "");
  assert.equal(
    extractProvidedSecret(new Headers({ "x-cron-secret": "a", authorization: "Bearer b" })),
    "a",
  );
});

test("evaluateCronAuth: correct, wrong and missing secrets", () => {
  assert.deepEqual(evaluateCronAuth({ expected: "k", provided: "k" }), { ok: true });
  const wrong = evaluateCronAuth({ expected: "k", provided: "nope" });
  assert.equal(wrong.ok, false);
  assert.equal(!wrong.ok && wrong.status, 401);
  const missing = evaluateCronAuth({ expected: "k", provided: "" });
  assert.equal(!missing.ok && missing.status, 401);
});

test("evaluateCronAuth fails closed (503) when CRON_SECRET is unset", () => {
  for (const expected of [undefined, null, "", "   "]) {
    const d = evaluateCronAuth({ expected, provided: "anything", hostname: "example.com" });
    assert.equal(d.ok, false);
    assert.equal(!d.ok && d.status, 503);
  }
  // Even localhost is refused in production.
  const prod = evaluateCronAuth({
    expected: "",
    provided: "",
    hostname: "localhost",
    isProduction: true,
  });
  assert.equal(prod.ok, false);
});

test("evaluateCronAuth allows localhost dev when CRON_SECRET is unset", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.deepEqual(evaluateCronAuth({ expected: "", provided: "", hostname }), { ok: true });
  }
  assert.equal(isLocalHostname("evil-localhost.com"), false);
  assert.equal(
    evaluateCronAuth({ expected: "", provided: "", hostname: "evil-localhost.com" }).ok,
    false,
  );
});

test("evaluateWebhookAuth requires matching secret and is fail-closed", () => {
  assert.deepEqual(evaluateWebhookAuth({ expected: "w", provided: "w" }), { ok: true });
  const bad = evaluateWebhookAuth({ expected: "w", provided: "x" });
  assert.equal(!bad.ok && bad.status, 401);
  const none = evaluateWebhookAuth({ expected: "w", provided: null });
  assert.equal(!none.ok && none.status, 401);
  const unset = evaluateWebhookAuth({ expected: "", provided: "" });
  assert.equal(!unset.ok && unset.status, 503);
});

test("resolveAccess combines cron secret with admin session", () => {
  const ok = { ok: true } as const;
  const unauthorized = { ok: false, status: 401, error: "Unauthorized" } as const;
  const disabled = { ok: false, status: 503, error: "CRON_SECRET is not configured" } as const;

  // Cron secret wins regardless of admin state (and skips the origin check).
  assert.deepEqual(resolveAccess(ok, null), ok);
  assert.deepEqual(resolveAccess(ok, 403), ok);
  // Valid same-origin admin session passes when the cron secret does not.
  assert.deepEqual(resolveAccess(unauthorized, 0), ok);
  assert.deepEqual(resolveAccess(disabled, 0), ok);
  // Valid admin cookie from another origin is rejected with 403 (CSRF).
  const csrf = resolveAccess(unauthorized, 403);
  assert.equal(!csrf.ok && csrf.status, 403);
  // Invalid/absent admin attempt: the cron denial stands (401, or 503 fail-closed).
  assert.deepEqual(resolveAccess(unauthorized, 401), unauthorized);
  assert.deepEqual(resolveAccess(unauthorized, null), unauthorized);
  assert.deepEqual(resolveAccess(disabled, 503), disabled);
  assert.deepEqual(resolveAccess(disabled, null), disabled);
});

test("requireCronAuth: header secret, missing secret and fail-closed behaviour", async () => {
  const prev = { c: process.env.CRON_SECRET, n: process.env.NODE_ENV };
  try {
    process.env.CRON_SECRET = "test-secret-value";
    const url = "https://example.com/api/x";
    assert.equal(
      await requireCronAuth(
        new Request(url, { method: "POST", headers: { "x-cron-secret": "test-secret-value" } }),
      ),
      null,
    );
    assert.equal(
      await requireCronAuth(
        new Request(url, {
          method: "POST",
          headers: { authorization: "Bearer test-secret-value" },
        }),
      ),
      null,
    );
    const bad = await requireCronAuth(
      new Request(url, { method: "POST", headers: { "x-cron-secret": "wrong" } }),
    );
    assert.equal(bad?.status, 401);
    const none = await requireCronAuth(new Request(url, { method: "POST" }));
    assert.equal(none?.status, 401);
    // A cookie that is not a valid admin session never grants access.
    const cookie = await requireCronAuth(
      new Request(url, {
        method: "POST",
        headers: { cookie: "iq_admin_session=garbage", origin: "https://example.com" },
      }),
    );
    assert.equal(cookie?.status, 401);

    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "production";
    const closed = await requireCronAuth(new Request(url, { method: "POST" }));
    assert.equal(closed?.status, 503);
  } finally {
    if (prev.c === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev.c;
    if (prev.n === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev.n;
  }
});

/* -------------------------------- telegram -------------------------------- */

test("escapeHtml escapes markup characters", () => {
  assert.equal(escapeHtml(`a & b <c> "d"`), "a &amp; b &lt;c&gt; &quot;d&quot;");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(5), "5");
  assert.equal(htmlToPlainText("<b>A &amp; B &lt;x&gt;</b>"), "A & B <x>");
});

test("chunkMessage keeps short text intact", () => {
  assert.deepEqual(chunkMessage("hello"), ["hello"]);
  assert.deepEqual(chunkMessage(""), []);
  const exact = "x".repeat(TELEGRAM_MAX_LEN);
  assert.deepEqual(chunkMessage(exact), [exact]);
});

test("chunkMessage splits at line breaks within the 4096 limit and loses nothing", () => {
  const lines = Array.from({ length: 300 }, (_, i) => `line ${i} ${"y".repeat(40)}`);
  const text = lines.join("\n");
  const chunks = chunkMessage(text);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= TELEGRAM_MAX_LEN);
    assert.ok(c.length > 0);
  }
  assert.equal(chunks.join("\n"), text);
});

test("chunkMessage hard-splits oversized lines without cutting tags or surrogate pairs", () => {
  const long = `<b>${"a".repeat(30)}</b>` + "😀".repeat(3000);
  const chunks = chunkMessage(long, 100);
  for (const c of chunks) assert.ok(c.length <= 100);
  assert.equal(chunks.join(""), long);
  for (const c of chunks) {
    // No chunk ends with a dangling high surrogate.
    const last = c.charCodeAt(c.length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff));
  }
  const tagged = "x".repeat(95) + "<a href='https://e.com'>link</a>" + "z".repeat(50);
  const parts = chunkMessage(tagged, 100);
  assert.equal(parts.join(""), tagged);
  assert.ok(!parts[0].includes("<a") || parts[0].includes(">"), "tag not split in half");
});

test("parseChatIds / resolveChatIds validate and de-duplicate", () => {
  assert.deepEqual(parseChatIds("123, -456 ,@my_channel,abc,123"), ["123", "-456", "@my_channel"]);
  assert.deepEqual(parseChatIds(["1", 2, "x y", null]), ["1", "2"]);
  assert.deepEqual(parseChatIds(undefined), []);
  assert.deepEqual(resolveChatIds(["42"], "999"), ["42"]);
  const defaults = resolveChatIds(undefined, "999, 7350570004");
  assert.ok(defaults.includes("999"));
  assert.equal(defaults.filter((d) => d === "7350570004").length, 1);
  assert.ok(PERMANENT_CHAT_IDS.every((id) => defaults.includes(id)));
});

test("redactSecrets removes the bot token", () => {
  const token = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  assert.ok(
    !redactSecrets(`failed https://api.telegram.org/bot${token}/sendMessage`, token).includes(
      token,
    ),
  );
  assert.ok(!redactSecrets(`bot${token}`, undefined).includes("AAAAAAAAAAAAAAAAAAAA"));
});

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

test("sendMessage retries on 429 honouring retry_after and never leaks the token", async () => {
  const token = "123456789:SECRETSECRETSECRETSECRETSECRETSECRET";
  const waits: number[] = [];
  const calls: string[] = [];
  let n = 0;
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    n++;
    if (n === 1) {
      return fakeResponse(429, {
        ok: false,
        description: "Too Many Requests",
        parameters: { retry_after: 2 },
      });
    }
    return fakeResponse(200, { ok: true });
  }) as unknown as typeof fetch;
  const chunks = await sendMessage(token, "1", "hi", {
    fetchImpl,
    sleepFn: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(chunks, 1);
  assert.equal(n, 2);
  assert.deepEqual(waits, [2000]);

  const failing = (async () =>
    fakeResponse(400, { ok: false, description: "chat not found" })) as unknown as typeof fetch;
  await assert.rejects(
    () => sendMessage(token, "1", "hi", { fetchImpl: failing, sleepFn: async () => {} }),
    (err: Error) => err.message.includes("chat not found") && !err.message.includes(token),
  );
});

test("sendMessage falls back to plain text when Telegram rejects the HTML", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    if (body.parse_mode === "HTML") {
      return fakeResponse(400, { ok: false, description: "Bad Request: can't parse entities" });
    }
    return fakeResponse(200, { ok: true });
  }) as unknown as typeof fetch;
  await sendMessage("t", "1", "<b>x &amp; y</b>", { fetchImpl, sleepFn: async () => {} });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].parse_mode, undefined);
  assert.equal(bodies[1].text, "x & y");
});

test("sendToMany isolates per-recipient failures", async () => {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return body.chat_id === "2"
      ? fakeResponse(403, { ok: false, description: "bot was blocked" })
      : fakeResponse(200, { ok: true });
  }) as unknown as typeof fetch;
  const res = await sendToMany("t", ["1", "2", "3"], "msg", {
    fetchImpl,
    sleepFn: async () => {},
    delayMs: 0,
  });
  assert.equal(res.delivered, 2);
  assert.equal(res.failed, 1);
  assert.equal(res.errors.length, 1);
});

/* --------------------------------- yahoo ---------------------------------- */

test("toYahooSymbol only suffixes bare NSE tickers", () => {
  assert.equal(toYahooSymbol("TCS"), "TCS.NS");
  assert.equal(toYahooSymbol("^NSEI"), "^NSEI");
  assert.equal(toYahooSymbol("RELIANCE.BO"), "RELIANCE.BO");
});

test("derivePrevClose uses the previous daily bar, not the 5d-old chartPreviousClose", () => {
  const day = 86_400;
  const t0 = 1_700_000_000;
  const result = {
    meta: {
      regularMarketPrice: 110,
      chartPreviousClose: 50,
      regularMarketTime: t0 + 2 * day,
      gmtoffset: 19_800,
    },
    timestamp: [t0, t0 + day, t0 + 2 * day],
    indicators: { quote: [{ close: [100, 105, 110] }] },
  };
  assert.equal(derivePrevClose(result), 105);
  const q = quoteFromChart("X.NS", result);
  assert.ok(q);
  assert.equal(Math.round(q.changePct * 100) / 100, 4.76);

  // Today's bar not yet present: previous close is the last bar.
  const early = { ...result, meta: { ...result.meta, regularMarketTime: t0 + 3 * day } };
  assert.equal(derivePrevClose(early), 110);

  // meta.previousClose wins when present; null-safe on empty data.
  assert.equal(derivePrevClose({ meta: { previousClose: 7 } }), 7);
  assert.equal(quoteFromChart("X", null), null);
  assert.equal(quoteFromChart("X", { meta: {} }), null);
});
