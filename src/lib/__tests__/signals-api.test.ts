import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInstrument,
  getMarketForInstrument,
  generateSignalId,
  normalizeExpiryDate,
  setupToExternalSignal,
  paperOrderToExternalSignal,
  createSignalsRateLimiter,
  verifyInvestIQApiKey,
  recordSignal,
  clearRecordedSignals,
  fetchAllSignals,
  type ExternalSignal,
  type SupportedInstrument,
  type SupportedMarket,
} from "../signals-api.server.ts";
import type { HighProfitTradeSetup } from "../trade-analysis.ts";
import type { PaperOrder } from "../orders-store.server.ts";

describe("Signals API - Instrument Normalization and Market Routing", () => {
  test("Normalizes all Indian F&O instruments to exact supported codes", () => {
    assert.strictEqual(normalizeInstrument("NIFTY 50"), "NIFTY");
    assert.strictEqual(normalizeInstrument("nifty"), "NIFTY");
    assert.strictEqual(normalizeInstrument("NIFTY50"), "NIFTY");
    assert.strictEqual(normalizeInstrument("^NSEI"), "NIFTY");

    assert.strictEqual(normalizeInstrument("BANK NIFTY"), "BANKNIFTY");
    assert.strictEqual(normalizeInstrument("banknifty"), "BANKNIFTY");
    assert.strictEqual(normalizeInstrument("NIFTY BANK"), "BANKNIFTY");
    assert.strictEqual(normalizeInstrument("^NSEBANK"), "BANKNIFTY");

    assert.strictEqual(normalizeInstrument("SENSEX"), "SENSEX");
    assert.strictEqual(normalizeInstrument("BSE SENSEX"), "SENSEX");
    assert.strictEqual(normalizeInstrument("^BSESN"), "SENSEX");

    assert.strictEqual(normalizeInstrument("FIN NIFTY"), "FINNIFTY");
    assert.strictEqual(normalizeInstrument("FINNIFTY"), "FINNIFTY");
    assert.strictEqual(normalizeInstrument("NIFTY_FIN_SERVICE"), "FINNIFTY");
    assert.strictEqual(normalizeInstrument("CNXFINANCE"), "FINNIFTY");

    assert.strictEqual(normalizeInstrument("MIDCAP NIFTY"), "MIDCPNIFTY");
    assert.strictEqual(normalizeInstrument("MIDCPNIFTY"), "MIDCPNIFTY");
    assert.strictEqual(normalizeInstrument("NIFTY MIDCAP 100"), "MIDCPNIFTY");
    assert.strictEqual(normalizeInstrument("MIDCAP"), "MIDCPNIFTY");
  });

  test("Normalizes all US F&O instruments to exact supported codes", () => {
    assert.strictEqual(normalizeInstrument("S&P 500"), "SPX");
    assert.strictEqual(normalizeInstrument("SP500"), "SPX");
    assert.strictEqual(normalizeInstrument("SPX"), "SPX");
    assert.strictEqual(normalizeInstrument("ES=F"), "SPX");

    assert.strictEqual(normalizeInstrument("NASDAQ 100"), "NDX");
    assert.strictEqual(normalizeInstrument("NASDAQ100"), "NDX");
    assert.strictEqual(normalizeInstrument("NDX"), "NDX");
    assert.strictEqual(normalizeInstrument("NAS100"), "NDX");
    assert.strictEqual(normalizeInstrument("NQ=F"), "NDX");

    assert.strictEqual(normalizeInstrument("DOW JONES"), "DJI");
    assert.strictEqual(normalizeInstrument("DOW"), "DJI");
    assert.strictEqual(normalizeInstrument("DJI"), "DJI");
    assert.strictEqual(normalizeInstrument("YM=F"), "DJI");
    assert.strictEqual(normalizeInstrument("DOW 30"), "DJI");
  });

  test("Rejects unknown or unsupported instruments", () => {
    assert.strictEqual(normalizeInstrument("RELIANCE"), null);
    assert.strictEqual(normalizeInstrument("TCS"), null);
    assert.strictEqual(normalizeInstrument("AAPL"), null);
    assert.strictEqual(normalizeInstrument("BTCUSD"), null);
    assert.strictEqual(normalizeInstrument(""), null);
    assert.strictEqual(normalizeInstrument(null), null);
    assert.strictEqual(normalizeInstrument(undefined), null);
  });

  test("Automatically routes instrument to correct market and currency", () => {
    const indian: SupportedInstrument[] = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY"];
    for (const inst of indian) {
      assert.strictEqual(getMarketForInstrument(inst), "INDIA_FNO");
    }

    const us: SupportedInstrument[] = ["SPX", "NDX", "DJI"];
    for (const inst of us) {
      assert.strictEqual(getMarketForInstrument(inst), "US_FNO");
    }
  });
});

describe("Signals API - Stable IDs and Formatting", () => {
  test("Signal IDs are deterministic and never change for identical signal attributes", () => {
    const id1 = generateSignalId(
      "INDIA_FNO",
      "BANKNIFTY",
      "2026-11-06",
      52000,
      "CE",
      "BUY",
      "2026-10-31T09:15:00.000Z",
    );
    const id2 = generateSignalId(
      "INDIA_FNO",
      "BANKNIFTY",
      "2026-11-06",
      52000,
      "CE",
      "BUY",
      "2026-10-31T09:15:00.000Z",
    );
    assert.strictEqual(id1, id2);
    assert.match(id1, /^sig_india_fno_banknifty_2026-11-06_52000_ce_buy_/);
  });

  test("Distinct signals produce unique IDs", () => {
    const idA = generateSignalId(
      "INDIA_FNO",
      "BANKNIFTY",
      "2026-11-06",
      52000,
      "CE",
      "BUY",
      "2026-10-31T09:15:00.000Z",
    );
    const idB = generateSignalId(
      "INDIA_FNO",
      "BANKNIFTY",
      "2026-11-06",
      52500,
      "PE",
      "BUY",
      "2026-10-31T09:15:00.000Z",
    );
    const idC = generateSignalId(
      "US_FNO",
      "SPX",
      "2026-11-06",
      5800,
      "CE",
      "BUY",
      "2026-10-31T09:15:00.000Z",
    );
    assert.notStrictEqual(idA, idB);
    assert.notStrictEqual(idA, idC);
  });

  test("Normalizes expiry dates to strict YYYY-MM-DD", () => {
    assert.strictEqual(normalizeExpiryDate("2026-11-06"), "2026-11-06");
    assert.strictEqual(normalizeExpiryDate("06-NOV-2026"), "2026-11-06");
    assert.strictEqual(normalizeExpiryDate("06Nov2026"), "2026-11-06");
    assert.match(normalizeExpiryDate(undefined, new Date("2026-10-31T00:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Signals API - Trade Setup & Order Transformation", () => {
  test("Converts HighProfitTradeSetup to strictly valid ExternalSignal", () => {
    const setup: HighProfitTradeSetup = {
      tradeId: "TRADE_NSE_BANKNIFTY_52000CE_2026-11-06",
      symbol: "BANK NIFTY",
      market: "NSE_FNO",
      action: "BUY",
      optionType: "CE",
      contract: "BANKNIFTY 52000 CE",
      strategy: "BULL_CALL_MOMENTUM",
      spotPrice: 52100.5,
      spotEntryTrigger: "ORB Breakout",
      premiumEntryRange: "240-250",
      entryPrice: 245.5,
      stopLossPrice: 191.49,
      target1: 326.5,
      target2: 400.0,
      target3: 500.0,
      riskRewardRatio: "2.5:1",
      expectedProfitPctT2: "62.9%",
      lotSize: 15,
      currency: "INR",
      timing: { isMarketOpen: true, marketPhase: "REGULAR", sessionHours: "09:15-15:30 IST" } as any,
      chartTechnicals: {} as any,
      greeks: { atmStrike: 52000 } as any,
      bestProfitRationale: "Solid trend alignment",
      createdAt: "2026-10-31T09:30:00.000Z",
      expiry: "2026-11-06",
    };

    const sig = setupToExternalSignal(setup);
    assert.ok(sig);
    assert.strictEqual(sig.market, "INDIA_FNO");
    assert.strictEqual(sig.instrument, "BANKNIFTY");
    assert.strictEqual(sig.instrument_type, "OPTION");
    assert.strictEqual(sig.expiry, "2026-11-06");
    assert.strictEqual(sig.strike, 52000);
    assert.strictEqual(sig.option_type, "CE");
    assert.strictEqual(sig.side, "BUY");
    assert.strictEqual(sig.lots, 1);
    assert.strictEqual(sig.price, 245.5);
    assert.strictEqual(sig.stop_loss, 191.49);
    assert.strictEqual(sig.target, 326.5);
    assert.strictEqual(sig.currency, "INR");
    assert.strictEqual(sig.created_at, "2026-10-31T09:30:00.000Z");
  });

  test("Converts US setup to US_FNO signal with USD currency", () => {
    const setup: HighProfitTradeSetup = {
      tradeId: "TRADE_GLOBAL_SPX_5800CE_2026-11-06",
      symbol: "S&P 500",
      market: "GLOBAL_US",
      action: "BUY",
      optionType: "CALL",
      contract: "SPX 5800 CALL",
      strategy: "BULLISH_BREAKOUT",
      spotPrice: 5820.0,
      spotEntryTrigger: "Above VWAP",
      premiumEntryRange: "45-50",
      entryPrice: 48.0,
      stopLossPrice: 38.0,
      target1: 65.0,
      target2: 80.0,
      target3: 100.0,
      riskRewardRatio: "2.1:1",
      expectedProfitPctT2: "66.7%",
      lotSize: 1,
      currency: "USD",
      timing: {} as any,
      chartTechnicals: {} as any,
      greeks: { atmStrike: 5800 } as any,
      bestProfitRationale: "Strong tech momentum",
      createdAt: "2026-10-31T14:30:00.000Z",
      expiry: "2026-11-06",
    };

    const sig = setupToExternalSignal(setup);
    assert.ok(sig);
    assert.strictEqual(sig.market, "US_FNO");
    assert.strictEqual(sig.instrument, "SPX");
    assert.strictEqual(sig.instrument_type, "OPTION");
    assert.strictEqual(sig.option_type, "CE");
    assert.strictEqual(sig.currency, "USD");
    assert.strictEqual(sig.price, 48.0);
  });

  test("Rejects trade setup with unknown instrument", () => {
    const setup: any = {
      tradeId: "TRADE_UNKNOWN",
      symbol: "INVALID_TICKER",
      contract: "INVALID 100 CE",
      action: "BUY",
      entryPrice: 10,
    };
    assert.strictEqual(setupToExternalSignal(setup), null);
  });

  test("Converts PaperOrder into ExternalSignal", () => {
    const order: PaperOrder = {
      orderId: "AUTO_12345",
      status: "FILLED",
      market: "NSE_FNO",
      symbol: "NIFTY 50",
      contract: "NIFTY 24500 PE",
      action: "BUY",
      orderType: "MARKET",
      lots: 2,
      lotSize: 25,
      totalQuantity: 50,
      fillPrice: 130.25,
      currency: "INR",
      totalOutlay: 6512.5,
      target1: 180.0,
      target2: 220.0,
      target3: 260.0,
      stopLoss: 95.0,
      timestamp: "2026-10-31T10:00:00.000Z",
      timingNote: "Morning session",
      source: "auto_trader",
      priceSource: "trade_setup",
      isSimulated: true,
    };

    const sig = paperOrderToExternalSignal(order);
    assert.ok(sig);
    assert.strictEqual(sig.market, "INDIA_FNO");
    assert.strictEqual(sig.instrument, "NIFTY");
    assert.strictEqual(sig.instrument_type, "OPTION");
    assert.strictEqual(sig.strike, 24500);
    assert.strictEqual(sig.option_type, "PE");
    assert.strictEqual(sig.side, "BUY");
    assert.strictEqual(sig.lots, 1);
    assert.strictEqual(sig.price, 130.25);
    assert.strictEqual(sig.stop_loss, 95.0);
    assert.strictEqual(sig.target, 180.0);
  });
});

describe("Signals API - Authentication Check", () => {
  const TEST_KEY = "iq_live_test_secret_key_1234567890abcdef1234567890";

  test("Rejects request when x-api-key is missing (401)", async () => {
    const req = new Request("https://example.com/api/signals");
    const result = await verifyInvestIQApiKey(req);
    assert.strictEqual(result.authorized, false);
    assert.match(result.error ?? "", /Missing API key/);
  });

  test("Rejects request with invalid key (401)", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    const req = new Request("https://example.com/api/signals", {
      headers: { "x-api-key": "iq_live_wrong_invalid_key_99999" },
    });
    const result = await verifyInvestIQApiKey(req);
    assert.strictEqual(result.authorized, false);
    assert.match(result.error ?? "", /Invalid API key/);
  });

  test("Accepts request with valid x-api-key header", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    const req = new Request("https://example.com/api/signals", {
      headers: { "x-api-key": TEST_KEY },
    });
    const result = await verifyInvestIQApiKey(req);
    assert.strictEqual(result.authorized, true);
  });

  test("Accepts valid key via Authorization: Bearer <key>", async () => {
    process.env.INVESTIQ_API_KEY = TEST_KEY;
    const req = new Request("https://example.com/api/signals", {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    const result = await verifyInvestIQApiKey(req);
    assert.strictEqual(result.authorized, true);
  });

  test("Supports comma-separated keys for zero-downtime rotation", async () => {
    const key1 = "iq_live_key_one_111111111111111111111111111111";
    const key2 = "iq_live_key_two_222222222222222222222222222222";
    process.env.INVESTIQ_API_KEY = `${key1}, ${key2}`;

    const req1 = new Request("https://example.com/api/signals", {
      headers: { "x-api-key": key1 },
    });
    const res1 = await verifyInvestIQApiKey(req1);
    assert.strictEqual(res1.authorized, true);

    const req2 = new Request("https://example.com/api/signals", {
      headers: { "x-api-key": key2 },
    });
    const res2 = await verifyInvestIQApiKey(req2);
    assert.strictEqual(res2.authorized, true);
  });
});

describe("Signals API - Rate Limiting", () => {
  test("Allows requests within limit and blocks when exceeded", () => {
    const limiter = createSignalsRateLimiter(5, 60_000);
    const clientId = "test-client-ip";
    const now = 1000000;

    for (let i = 0; i < 5; i++) {
      const res = limiter.check(clientId, now);
      assert.strictEqual(res.allowed, true);
    }

    // 6th request must be blocked
    const blocked = limiter.check(clientId, now);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.remaining, 0);
    assert.strictEqual(blocked.retryAfterSeconds, 60);

    // After window expires, must allow again
    const later = limiter.check(clientId, now + 60_001);
    assert.strictEqual(later.allowed, true);
  });
});

describe("Signals API - Query Filters", () => {
  test("Filters signals by market and since timestamp", async () => {
    clearRecordedSignals();

    const sigIndia: ExternalSignal = {
      id: "sig_india_1",
      market: "INDIA_FNO",
      instrument: "BANKNIFTY",
      instrument_type: "OPTION",
      expiry: "2026-11-06",
      strike: 52000,
      option_type: "CE",
      side: "BUY",
      lots: 1,
      price: 245.5,
      stop_loss: 195.0,
      target: 320.0,
      currency: "INR",
      created_at: "2026-10-31T09:30:00.000Z",
    };

    const sigUS: ExternalSignal = {
      id: "sig_us_1",
      market: "US_FNO",
      instrument: "SPX",
      instrument_type: "OPTION",
      expiry: "2026-11-06",
      strike: 5800,
      option_type: "CE",
      side: "BUY",
      lots: 1,
      price: 52.0,
      stop_loss: 40.0,
      target: 70.0,
      currency: "USD",
      created_at: "2026-10-31T14:30:00.000Z",
    };

    recordSignal(sigIndia);
    recordSignal(sigUS);

    // All signals
    const all = await fetchAllSignals({});
    assert.ok(all.some((s) => s.id === "sig_india_1"));
    assert.ok(all.some((s) => s.id === "sig_us_1"));

    // India only filter
    const indiaOnly = await fetchAllSignals({ market: "INDIA_FNO" });
    assert.ok(indiaOnly.every((s) => s.market === "INDIA_FNO"));
    assert.ok(indiaOnly.some((s) => s.id === "sig_india_1"));
    assert.ok(!indiaOnly.some((s) => s.id === "sig_us_1"));

    // US only filter
    const usOnly = await fetchAllSignals({ market: "US_FNO" });
    assert.ok(usOnly.every((s) => s.market === "US_FNO"));
    assert.ok(usOnly.some((s) => s.id === "sig_us_1"));
    assert.ok(!usOnly.some((s) => s.id === "sig_india_1"));

    // Since filter
    const sinceFiltered = await fetchAllSignals({ since: "2026-10-31T12:00:00.000Z" });
    assert.ok(sinceFiltered.some((s) => s.id === "sig_us_1"));
    assert.ok(!sinceFiltered.some((s) => s.id === "sig_india_1"));
  });
});
