import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TtlCache,
  allowMockData,
  classifyFreshness,
  clampInt,
  computeBackoffMs,
  fetchWithRetry,
  isMarketOpenAt,
  isValidExpiry,
  isValidInstrumentKey,
  isValidSymbol,
  parseSymbolList,
  pickNearestExpiry,
  redactSecrets,
  safeErrorMessage,
} from "../provider-utils.ts";
import {
  aggregateBars,
  parseCboeChainText,
  parseDhanCandles,
  parseDhanExpiryList,
  parseDhanMarketFeed,
  parseDhanOptionChain,
  parseOccSymbol,
  parseSensibullPartnerGreeks,
  parseYahooChart,
} from "../provider-parsers.ts";

describe("TtlCache", () => {
  test("honours TTL and exposes stale values", () => {
    const c = new TtlCache<number>(5);
    c.set("a", 1, 1000);
    assert.equal(c.get("a", 500, 1400), 1);
    assert.equal(c.get("a", 500, 1600), undefined);
    assert.deepEqual(c.getStale("a", Infinity, 1600), { value: 1, ageMs: 600 });
    assert.equal(c.getStale("a", 100, 1600), undefined);
  });

  test("evicts the oldest entry when full", () => {
    const c = new TtlCache<number>(2);
    c.set("a", 1, 1);
    c.set("b", 2, 2);
    c.set("c", 3, 3);
    assert.equal(c.size, 2);
    assert.equal(c.getStale("a"), undefined);
    assert.equal(c.getStale("c")?.value, 3);
  });
});

describe("input validators", () => {
  test("symbols", () => {
    for (const ok of ["RELIANCE.NS", "^NSEI", "NIFTY 50", "M&M", "ES=F", "BAJAJ-AUTO"]) {
      assert.ok(isValidSymbol(ok), ok);
    }
    for (const bad of ["", "a/b", "x?y=1", "../etc", "<script>", "A".repeat(33), 5]) {
      assert.ok(!isValidSymbol(bad), String(bad));
    }
  });

  test("expiry must be a real YYYY-MM-DD date", () => {
    assert.ok(isValidExpiry("2026-10-29"));
    assert.ok(!isValidExpiry("2026-02-30"));
    assert.ok(!isValidExpiry("29-10-2026"));
    assert.ok(!isValidExpiry("2026-10-29T00:00"));
  });

  test("instrument keys", () => {
    assert.ok(isValidInstrumentKey("NSE_INDEX|Nifty 50"));
    assert.ok(isValidInstrumentKey("BSE_INDEX|SENSEX"));
    assert.ok(!isValidInstrumentKey("nse|x"));
    assert.ok(!isValidInstrumentKey("NSE_INDEX|a&b=c/../"));
  });

  test("clampInt, parseSymbolList and pickNearestExpiry", () => {
    assert.equal(clampInt("500", 1, 100, 5), 100);
    assert.equal(clampInt("abc", 1, 100, 5), 5);
    assert.deepEqual(parseSymbolList("A, B,A,bad/sym,C", 3), ["A", "B", "C"]);
    assert.equal(
      pickNearestExpiry(["2026-11-05", "2026-10-29", "2026-10-01"], "2026-10-27"),
      "2026-10-29",
    );
    assert.equal(pickNearestExpiry(["2026-10-01"], "2026-10-27"), "2026-10-01");
  });
});

describe("secrets never leak", () => {
  test("redactSecrets strips bearer tokens, explicit secrets and JWTs", () => {
    const out = redactSecrets(
      "failed Authorization: Bearer abc.def.ghi token=supersecret123 SECRETVALUE",
      ["SECRETVALUE"],
    );
    assert.ok(!out.includes("abc.def.ghi"));
    assert.ok(!out.includes("supersecret123"));
    assert.ok(!out.includes("SECRETVALUE"));
  });

  test("safeErrorMessage falls back and truncates", () => {
    assert.equal(safeErrorMessage(undefined, "nope"), "nope");
    assert.ok(safeErrorMessage(new Error("x".repeat(1000))).length <= 300);
  });
});

describe("fetchWithRetry", () => {
  const noSleep = async () => {};

  test("retries 5xx for GET then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls < 3 ? new Response("err", { status: 503 }) : new Response("ok", { status: 200 });
    }) as typeof fetch;
    const res = await fetchWithRetry(
      "https://example.com/x?token=abc",
      {},
      { fetchImpl, sleep: noSleep, retries: 2 },
    );
    assert.equal(res.status, 200);
    assert.equal(calls, 3);
  });

  test("does not retry non-idempotent POST", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("err", { status: 500 });
    }) as typeof fetch;
    const res = await fetchWithRetry(
      "https://example.com",
      { method: "POST" },
      { fetchImpl, sleep: noSleep },
    );
    assert.equal(res.status, 500);
    assert.equal(calls, 1);
  });

  test("final network failure throws a sanitized error without the URL", async () => {
    const fetchImpl = (async () => {
      throw new Error("connect ECONNREFUSED https://example.com/secret?token=abc");
    }) as typeof fetch;
    await assert.rejects(
      fetchWithRetry(
        "https://example.com/secret?token=abc",
        {},
        { fetchImpl, sleep: noSleep, retries: 1 },
      ),
      (e: Error) =>
        !e.message.includes("token=abc") &&
        !e.message.includes("secret") &&
        e.message.includes("example.com"),
    );
  });

  test("backoff grows and honours Retry-After (capped)", () => {
    assert.equal(computeBackoffMs(0, 250), 250);
    assert.equal(computeBackoffMs(2, 250), 1000);
    assert.equal(computeBackoffMs(0, 250, "2"), 2000);
    assert.equal(computeBackoffMs(0, 250, "999"), 3000);
  });
});

describe("market hours and freshness", () => {
  test("NSE session in IST", () => {
    // Tue 2026-10-27 04:00Z = 09:30 IST (open); 11:00Z = 16:30 IST (closed); Sat closed.
    assert.ok(isMarketOpenAt(new Date("2026-10-27T04:00:00Z"), false));
    assert.ok(!isMarketOpenAt(new Date("2026-10-27T11:00:00Z"), false));
    assert.ok(!isMarketOpenAt(new Date("2026-10-31T06:00:00Z"), false));
    // Mon 00:00Z is 05:30 IST Monday -> closed; Sun 20:00Z is Mon 01:30 IST -> closed.
    assert.ok(!isMarketOpenAt(new Date("2026-10-26T00:00:00Z"), false));
  });

  test("global futures weekend gap", () => {
    assert.ok(!isMarketOpenAt(new Date("2026-10-31T12:00:00Z"), true));
    assert.ok(!isMarketOpenAt(new Date("2026-10-30T22:00:00Z"), true));
    assert.ok(isMarketOpenAt(new Date("2026-10-28T12:00:00Z"), true));
    assert.ok(isMarketOpenAt(new Date("2026-11-01T23:00:00Z"), true));
  });

  test("classifyFreshness", () => {
    const now = 1_000_000_000_000;
    assert.equal(classifyFreshness({ asOfMs: now - 10_000, nowMs: now, marketOpen: true }), "LIVE");
    assert.equal(
      classifyFreshness({ asOfMs: now - 10_000, nowMs: now, marketOpen: true, feed: "delayed" }),
      "DELAYED",
    );
    assert.equal(
      classifyFreshness({ asOfMs: now - 5 * 60_000, nowMs: now, marketOpen: true }),
      "DELAYED",
    );
    assert.equal(
      classifyFreshness({ asOfMs: now - 60 * 60_000, nowMs: now, marketOpen: true }),
      "STALE",
    );
    assert.equal(classifyFreshness({ asOfMs: undefined, nowMs: now, marketOpen: true }), "STALE");
    assert.equal(
      classifyFreshness({ asOfMs: now - 60 * 60_000, nowMs: now, marketOpen: false }),
      "MARKET_CLOSED",
    );
  });

  test("mock data is only allowed for the exact string 'true'", () => {
    assert.equal(allowMockData({ ALLOW_MOCK_DATA: "true" }), true);
    assert.equal(allowMockData({ ALLOW_MOCK_DATA: "1" }), false);
    assert.equal(allowMockData({ ALLOW_MOCK_DATA: "TRUE" }), false);
    assert.equal(allowMockData({}), false);
  });
});

describe("Yahoo chart parsing", () => {
  const payload = {
    chart: {
      result: [
        {
          meta: { currency: "INR", regularMarketPrice: "101.5", chartPreviousClose: 100 },
          timestamp: [1, 2, 3, 4],
          indicators: {
            quote: [
              {
                open: [1, null, 3, 4],
                high: [2, null, 4, 5],
                low: [0, null, 2, 3],
                close: [1.5, null, 3.5, 4.5],
                volume: [10, null, null, 40],
              },
            ],
          },
        },
      ],
    },
  };

  test("drops null rows and coerces numeric strings", () => {
    const c = parseYahooChart(payload);
    assert.ok(c);
    assert.equal(c.meta.regularMarketPrice, 101.5);
    assert.equal(c.bars.length, 3);
    assert.equal(c.bars[1].volume, 0);
    assert.equal(c.points.length, 3);
  });

  test("returns null for malformed payloads", () => {
    assert.equal(parseYahooChart(null), null);
    assert.equal(parseYahooChart({ chart: { result: [] } }), null);
    assert.equal(parseYahooChart({ chart: { result: null } }), null);
    assert.equal(parseYahooChart("<html>"), null);
  });

  test("aggregateBars folds OHLCV", () => {
    const c = parseYahooChart(payload);
    assert.ok(c);
    const [agg] = aggregateBars(c.bars, 3);
    assert.deepEqual(agg, { time: 1, open: 1, high: 5, low: 0, close: 4.5, volume: 50 });
  });
});

describe("DhanHQ parsing", () => {
  test("market feed rows keyed by segment and id", () => {
    const rows = parseDhanMarketFeed({
      status: "success",
      data: {
        NSE_EQ: {
          "2885": {
            last_price: 1400.5,
            ohlc: { open: 1390, high: 1410, low: 1385, close: 1395 },
            volume: 99,
          },
        },
        IDX_I: { "13": { last_price: 25000 } },
      },
    });
    assert.equal(rows.length, 2);
    const rel = rows.find((r) => r.securityId === 2885);
    assert.deepEqual(
      { s: rel?.segment, p: rel?.lastPrice, c: rel?.close, v: rel?.volume },
      { s: "NSE_EQ", p: 1400.5, c: 1395, v: 99 },
    );
    assert.deepEqual(parseDhanMarketFeed({ data: "nope" }), []);
  });

  test("candles accept seconds or milliseconds", () => {
    const out = parseDhanCandles({
      timestamp: [1_700_000_000, 1_700_000_060_000],
      open: [1, 2],
      high: [2, 3],
      low: [0, 1],
      close: [1.5, 2.5],
      volume: [5, 6],
    });
    assert.equal(out[0].t, 1_700_000_000_000);
    assert.equal(out[1].t, 1_700_000_060_000);
    assert.equal(out[1].price, 2.5);
  });

  test("option chain: oc keyed by strike (v2 shape)", () => {
    const parsed = parseDhanOptionChain({
      status: "success",
      data: {
        last_price: 25642.8,
        oc: {
          "25700.000000": {
            ce: {
              last_price: 100,
              oi: 1000,
              previous_oi: 800,
              implied_volatility: 11.2,
              greeks: { delta: 0.4, gamma: 0.001, theta: -10, vega: 12 },
              top_bid_price: 99,
              top_ask_price: 101,
            },
            pe: { last_price: 120, oi: 2000, previous_oi: 2500 },
          },
          "25650.000000": { ce: { last_price: 130 }, pe: { last_price: 90 } },
        },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed.spot, 25642.8);
    assert.deepEqual(
      parsed.rows.map((r) => r.strike),
      [25650, 25700],
    );
    assert.equal(parsed.rows[1].ce.delta, 0.4);
    assert.equal(parsed.rows[1].ce.prevOi, 800);
    assert.equal(parsed.rows[1].ce.bid, 99);
  });

  test("option chain: legacy array shape and empty/garbage input", () => {
    const parsed = parseDhanOptionChain({
      data: {
        last_price: 100,
        option_chains: [{ strike_price: 100, ce: { ltp: 5 }, pe: { ltp: 4 } }],
      },
    });
    assert.equal(parsed?.rows[0].ce.ltp, 5);
    assert.equal(parseDhanOptionChain({ data: { oc: {} } }), null);
    assert.equal(parseDhanOptionChain(null), null);
  });

  test("expiry list keeps valid dates only, sorted", () => {
    assert.deepEqual(parseDhanExpiryList({ data: ["2026-11-05", "bad", "2026-10-29", 5] }), [
      "2026-10-29",
      "2026-11-05",
    ]);
  });
});

describe("global (CBOE) chain parsing", () => {
  test("OCC symbols", () => {
    assert.deepEqual(parseOccSymbol("SPXW261028C07125000"), {
      expiry: "2026-10-28",
      type: "CE",
      strike: 7125,
    });
    assert.deepEqual(parseOccSymbol("SPX261120P00400000"), {
      expiry: "2026-11-20",
      type: "PE",
      strike: 400,
    });
    assert.equal(parseOccSymbol("garbage"), null);
  });

  test("text parser extracts one expiry inside the strike window", () => {
    const text = JSON.stringify({
      timestamp: "2026-10-27 10:24:13",
      data: {
        current_price: 7000,
        options: [
          {
            option: "SPXW261028C07000000",
            bid: 10,
            ask: 11,
            iv: 0.2,
            open_interest: 5,
            volume: 1,
            delta: 0.5,
            gamma: 0.01,
            theta: -1,
            vega: 2,
            last_trade_price: 10.5,
          },
          {
            option: "SPXW261028P07000000",
            bid: 9,
            ask: 10,
            iv: 0.21,
            open_interest: 7,
            volume: 2,
            delta: -0.5,
          },
          { option: "SPXW261028C09000000", bid: 1, ask: 2 },
          { option: "SPXW261030C07000000", bid: 12, ask: 13 },
        ],
      },
    });
    const out = parseCboeChainText(text, (all) => all[0]);
    assert.ok(out);
    assert.deepEqual(out.expiries, ["2026-10-28", "2026-10-30"]);
    assert.equal(out.expiry, "2026-10-28");
    assert.equal(out.spot, 7000);
    assert.equal(out.options.length, 2); // far-OTM strike and other expiry are excluded
    assert.equal(out.options.find((o) => o.type === "CE")?.leg.iv, 20); // fraction -> percent
    assert.equal(
      parseCboeChainText("{}", (a) => a[0]),
      null,
    );
  });
});

describe("Sensibull partner payload", () => {
  test("maps aliases and sorts by strike", () => {
    const rows = parseSensibullPartnerGreeks({
      data: [
        { strike: 200, ce_delta: 0.4, pe_delta: -0.6, gamma: 0.01, call_iv: 12 },
        { strike: 100, call_delta: 0.9, put_delta: -0.1 },
        { strike: 0 },
        "junk",
      ],
    });
    assert.deepEqual(
      rows.map((r) => r.strike),
      [100, 200],
    );
    assert.equal(rows[1].callDelta, 0.4);
    assert.equal(rows[1].putGamma, 0.01);
    assert.deepEqual(parseSensibullPartnerGreeks(null), []);
  });
});
