import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkKeyScopes,
  constantTimeEqual,
  extractApiKey,
  hostMatchesAllowlist,
  matchesAnyKey,
  parseList,
  resolveCorsOrigin,
  sha256Hex,
  validateOutboundUrl,
} from "../api-auth.server.ts";
import {
  createRateLimiter,
  buildSessionCookie,
  credentialVersion,
  isSameOrigin,
  parseCookies,
  signSession,
  verifySession,
  verifyCredentials,
  type SessionPayload,
} from "../admin-session.server.ts";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000_000;
const payload = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  sub: "admin",
  iat: Math.floor(NOW / 1000),
  exp: Math.floor(NOW / 1000) + 3600,
  cv: "abc",
  ...over,
});

describe("key comparison", () => {
  test("constantTimeEqual", async () => {
    assert.equal(await constantTimeEqual("abc", "abc"), true);
    assert.equal(await constantTimeEqual("abc", "abd"), false);
    assert.equal(await constantTimeEqual("abc", "abcd"), false);
    assert.equal(await constantTimeEqual("", "x"), false);
  });

  test("matchesAnyKey supports comma lists and rejects empty", async () => {
    const keys = parseList(" iq_nse_fno_one , iq_nse_fno_two ,,");
    assert.deepEqual(keys, ["iq_nse_fno_one", "iq_nse_fno_two"]);
    assert.equal(await matchesAnyKey("iq_nse_fno_two", keys), true);
    assert.equal(await matchesAnyKey("iq_nse_fno_three", keys), false);
    assert.equal(await matchesAnyKey("", keys), false);
    assert.equal(await matchesAnyKey("anything", []), false);
  });

  test("sha256Hex known vector", async () => {
    assert.equal(
      await sha256Hex("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("no built-in / prefix-only keys are accepted (fail closed)", async () => {
    delete process.env.NSE_FNO_API_KEY;
    delete process.env.GLOBAL_API_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await checkKeyScopes("iq_nse_fno_live_8f3a9e2c4b71d605a982e3f4", ["nse", "global"]);
    assert.deepEqual(r, { nse: false, global: false });
    const prefixOnly = await checkKeyScopes("iq_global_" + "x".repeat(40), ["nse", "global"]);
    assert.deepEqual(prefixOnly, { nse: false, global: false });
  });

  test("env keys validate per scope, with rotation list", async () => {
    process.env.NSE_FNO_API_KEY = "iq_nse_fno_old_key,iq_nse_fno_new_key";
    process.env.GLOBAL_API_KEY = "iq_global_only";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      assert.deepEqual(await checkKeyScopes("iq_nse_fno_new_key", ["nse", "global"]), {
        nse: true,
        global: false,
      });
      assert.deepEqual(await checkKeyScopes("iq_global_only", ["nse", "global"]), {
        nse: false,
        global: true,
      });
      assert.deepEqual(await checkKeyScopes("iq_global_only", ["nse"]), {
        nse: false,
        global: false,
      });
    } finally {
      delete process.env.NSE_FNO_API_KEY;
      delete process.env.GLOBAL_API_KEY;
    }
  });

  test("extractApiKey ignores the query string", () => {
    const q = new Request("https://x.test/api?apiKey=secret&api_key=secret");
    assert.equal(extractApiKey(q), "");
    assert.equal(
      extractApiKey(new Request("https://x.test/", { headers: { "x-api-key": " k1 " } })),
      "k1",
    );
    assert.equal(
      extractApiKey(new Request("https://x.test/", { headers: { authorization: "Bearer k2" } })),
      "k2",
    );
  });
});

describe("CORS allowlist", () => {
  const allowed = ["https://app.example.com", "https://partner.test"];
  test("reflects allowed origins only", () => {
    assert.equal(resolveCorsOrigin("https://app.example.com", allowed), "https://app.example.com");
    assert.equal(resolveCorsOrigin("https://PARTNER.test/", allowed), "https://PARTNER.test/");
    assert.equal(resolveCorsOrigin("https://evil.test", allowed), null);
    assert.equal(resolveCorsOrigin(null, allowed), null);
  });
});

describe("admin session", () => {
  test("sign + verify round trip", async () => {
    const token = await signSession(payload(), SECRET);
    const out = await verifySession(token, SECRET, NOW);
    assert.equal(out?.sub, "admin");
  });

  test("rejects tampered payload, wrong secret, expired, garbage", async () => {
    const token = await signSession(payload(), SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify(payload({ exp: 9_999_999_999 }))).toString(
      "base64url",
    );
    assert.equal(await verifySession(`${forged}.${sig}`, SECRET, NOW), null);
    assert.equal(await verifySession(token, "t".repeat(40), NOW), null);
    assert.equal(await verifySession(token, SECRET, NOW + 2 * 3600 * 1000), null);
    assert.equal(await verifySession(`${body}.`, SECRET, NOW), null);
    assert.equal(await verifySession("garbage", SECRET, NOW), null);
    assert.equal(await verifySession("", SECRET, NOW), null);
    assert.equal(await verifySession(token + ".extra", SECRET, NOW), null);
  });

  test("credential version changes with password and secret", async () => {
    const a = await credentialVersion(SECRET, "admin", "pw1");
    assert.equal(a, await credentialVersion(SECRET, "admin", "pw1"));
    assert.notEqual(a, await credentialVersion(SECRET, "admin", "pw2"));
    assert.notEqual(a, await credentialVersion("u".repeat(40), "admin", "pw1"));
  });

  test("verifyCredentials", async () => {
    const cfg = { username: "root", password: "hunter2-long", secret: SECRET };
    assert.equal(await verifyCredentials(cfg, "root", "hunter2-long"), true);
    assert.equal(await verifyCredentials(cfg, "root", "nope"), false);
    assert.equal(await verifyCredentials(cfg, "other", "hunter2-long"), false);
    assert.equal(await verifyCredentials(cfg, "", ""), false);
  });

  test("cookie attributes", () => {
    const c = buildSessionCookie("tok", { secure: true });
    for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=43200"]) {
      assert.ok(c.includes(part), part);
    }
    assert.ok(!buildSessionCookie("tok", { secure: false }).includes("Secure"));
    assert.deepEqual(parseCookies("a=1; iq_admin_session=tok; b=2"), {
      a: "1",
      iq_admin_session: "tok",
      b: "2",
    });
  });

  test("rate limiter blocks after max failures then expires", () => {
    const rl = createRateLimiter(3, 1000);
    for (let i = 0; i < 2; i++) rl.recordFailure("ip", 0);
    assert.equal(rl.blockedFor("ip", 10), 0);
    rl.recordFailure("ip", 20);
    assert.ok(rl.blockedFor("ip", 30) > 0);
    assert.equal(rl.blockedFor("other", 30), 0);
    assert.equal(rl.blockedFor("ip", 1500), 0);
    rl.recordFailure("ip", 2000);
    rl.reset("ip");
    assert.equal(rl.blockedFor("ip", 2001), 0);
  });

  test("isSameOrigin (CSRF)", () => {
    const mk = (origin: string | null, extra: Record<string, string> = {}) =>
      new Request("https://site.test/api/admin/keys", {
        method: "POST",
        headers: { ...(origin ? { origin } : {}), ...extra },
      });
    assert.equal(isSameOrigin(mk("https://site.test")), true);
    assert.equal(isSameOrigin(mk("https://evil.test")), false);
    assert.equal(isSameOrigin(mk(null)), false);
    assert.equal(isSameOrigin(mk("https://site.test", { "sec-fetch-site": "cross-site" })), false);
  });
});

describe("SSRF validator", () => {
  const ok = (u: string, allowedHosts: string[] = []) =>
    validateOutboundUrl(u, { allowedHosts }).ok;

  test("accepts public https hosts", () => {
    assert.equal(ok("https://example.com/hook"), true);
    assert.equal(ok("https://abc.lovableproject.com/api/public/x"), true);
    assert.equal(ok("https://8.8.8.8/x"), true);
  });

  test("rejects non-https, credentials, odd ports, garbage", () => {
    assert.equal(ok("http://example.com/"), false);
    assert.equal(ok("ftp://example.com/"), false);
    assert.equal(ok("https://user:pw@example.com/"), false);
    assert.equal(ok("https://example.com:8443/"), false);
    assert.equal(ok("not a url"), false);
    assert.equal(ok(""), false);
  });

  test("rejects localhost, internal names, private and metadata IPs", () => {
    for (const u of [
      "https://localhost/",
      "https://foo.localhost/",
      "https://intranet/",
      "https://printer.local/",
      "https://metadata.google.internal/",
      "https://127.0.0.1/",
      "https://0.0.0.0/",
      "https://10.1.2.3/",
      "https://172.16.0.1/",
      "https://172.31.255.255/",
      "https://192.168.1.1/",
      "https://169.254.169.254/latest/meta-data/",
      "https://100.64.0.1/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[fd00::1]/",
      "https://2130706433/", // decimal 127.0.0.1
      "https://0x7f.0.0.1/", // hex
      "https://0177.0.0.1/", // octal
      "https://127.1/",
      "https://224.0.0.1/",
    ]) {
      assert.equal(ok(u), false, u);
    }
    assert.equal(ok("https://172.32.0.1/"), true);
  });

  test("allowlist", () => {
    assert.equal(ok("https://hooks.partner.com/x", ["partner.com"]), true);
    assert.equal(ok("https://partner.com/x", ["partner.com"]), true);
    assert.equal(ok("https://hooks.partner.com/x", ["*.partner.com"]), true);
    assert.equal(ok("https://evilpartner.com/x", ["partner.com"]), false);
    assert.equal(ok("https://example.com/x", ["partner.com"]), false);
    assert.equal(hostMatchesAllowlist("a.b.com", ["b.com"]), true);
  });
});
