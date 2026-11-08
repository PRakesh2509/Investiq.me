import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { getTerminalSnapshot, WORKSTATION_INSTRUMENTS } from "../terminal-workstation.functions.ts";
import { getDhanOptionChain, getDhanChartCandles } from "../dhan.server.ts";
import { fetchDhanQuote, fetchDhanQuotes } from "../dhan-quotes.server.ts";
import { fetchMacroBackdrop } from "../trade-analysis.server.ts";
import { resolveDhanInstrument } from "../dhan-instrument-master.server.ts";

describe("Strict Data-Source Lock: Dhan Only (Zero Yahoo Finance)", () => {
  const originalFetch = globalThis.fetch;
  let blockedAttempts = 0;

  // Install strict network firewall blocking any legacy Yahoo host
  const FORBIDDEN_HOSTS = ["finance.yahoo.com", "query1.finance", "query2.finance", "yahoo.com"];

  function installFirewall() {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      for (const host of FORBIDDEN_HOSTS) {
        if (url.includes(host)) {
          blockedAttempts++;
          throw new Error(`STRICT_SECURITY_VIOLATION: Outbound call to ${host} is permanently blocked! URL: ${url}`);
        }
      }
      try {
        return await originalFetch(input, init);
      } catch {
        return new Response(JSON.stringify({ ok: false, message: "Network unavailable in test sandbox" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    };
  }

  function uninstallFirewall() {
    globalThis.fetch = originalFetch;
  }

  test("firewall successfully blocks any unauthorized outbound Yahoo call", async () => {
    installFirewall();
    try {
      await assert.rejects(
        async () => {
          await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI");
        },
        /STRICT_SECURITY_VIOLATION/,
      );
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 1 - F&O Terminal Snapshot loads Dhan-only or explicit DHAN_UNAVAILABLE (0 Yahoo calls)", async () => {
    installFirewall();
    try {
      const snap = await getTerminalSnapshot("NIFTY 50");
      assert.ok(snap);
      assert.strictEqual(blockedAttempts, 1); // Only the initial intentional test attempted it
      assert.ok(
        snap.dataSource.includes("Dhan") || snap.dataSource.includes("updated"),
        `Expected Dhan data source, got: ${snap.dataSource}`,
      );
      assert.ok(snap.disclaimer.toLowerCase().includes("investment advice"));
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 2 - Global Index Tab (S&P 500) returns explicit disabled DHAN_UNAVAILABLE without fetching US data", async () => {
    installFirewall();
    try {
      const snap = await getTerminalSnapshot("S&P 500");
      assert.strictEqual(snap.ok, false);
      assert.strictEqual(snap.grade, "DHAN_UNAVAILABLE");
      assert.strictEqual(snap.rationale, "Not available: Dhan covers Indian markets only.");
      assert.strictEqual(snap.dataSource, "Not available: Dhan covers Indian markets only.");
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 3 - Live Candlestick Bars load Dhan bars (0 Yahoo calls)", async () => {
    installFirewall();
    try {
      const candles = await getDhanChartCandles("NIFTY", "1d", 1);
      // Either valid candles or null/empty from Dhan, 0 outbound calls to Yahoo
      assert.ok(Array.isArray(candles) || candles === null);
      assert.strictEqual(blockedAttempts, 1);
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 4 - Global Tabs are resolved as non-Dhan with zero outbound calls", () => {
    assert.strictEqual(WORKSTATION_INSTRUMENTS["S&P 500"].isGlobal, true);
    assert.strictEqual(WORKSTATION_INSTRUMENTS["NASDAQ 100"].isGlobal, true);
    assert.strictEqual(WORKSTATION_INSTRUMENTS["DOW JONES"].isGlobal, true);
    assert.strictEqual(blockedAttempts, 1);
  });

  test("Panel 5 - Dhan Option Chain endpoint accesses only DhanHQ without fallbacks", async () => {
    installFirewall();
    try {
      const chain = await getDhanOptionChain("NIFTY");
      if (chain) {
        assert.ok(Array.isArray(chain.rows));
      }
      assert.strictEqual(blockedAttempts, 1);
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 6 - Stock Quotes load from DhanHQ only", async () => {
    installFirewall();
    try {
      const quotes = await fetchDhanQuotes(["RELIANCE", "TCS"]);
      assert.ok(Array.isArray(quotes));
      assert.strictEqual(blockedAttempts, 1);
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 7 - Single Quote uses DhanHQ only", async () => {
    installFirewall();
    try {
      const q = await fetchDhanQuote("INFY");
      assert.ok(q === null || typeof q.price === "number");
      assert.strictEqual(blockedAttempts, 1);
    } finally {
      uninstallFirewall();
    }
  });

  test("Panel 8 - Macro Backdrop uses DhanHQ Macro Feed only", async () => {
    installFirewall();
    try {
      const macro = await fetchMacroBackdrop("NSE_FNO");
      assert.ok(macro);
      assert.strictEqual(macro.source, "DhanHQ Macro Feed");
      assert.strictEqual(blockedAttempts, 1);
    } finally {
      uninstallFirewall();
    }
  });

  test("Final Audit: Total unblocked Yahoo requests during all panel tests is exactly 0", () => {
    assert.strictEqual(blockedAttempts, 1); // exactly the 1 intentional violation test
  });
});
