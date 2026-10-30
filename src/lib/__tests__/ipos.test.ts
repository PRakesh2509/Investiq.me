import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VERIFIED_IPOS } from "../ipos/data.ts";
import {
  calculateListingScenarios,
  computeIpoScore,
  ipoStatusLabel,
  resolveIpoStatus,
} from "../ipos/scoring.ts";

describe("IPO Research Engine & Scoring", () => {
  it("resolves status dynamically according to current system clock", () => {
    // Status resolution unit test with simulated dates
    const openSample = {
      openDate: "2026-10-28",
      closeDate: "2026-11-03",
      allotmentDate: "2026-11-06",
      listingDate: "2026-11-10",
    };
    assert.equal(resolveIpoStatus(openSample), "open");

    const upcomingSample = {
      openDate: "2026-11-15",
      closeDate: "2026-11-18",
      allotmentDate: "2026-11-20",
      listingDate: "2026-11-23",
    };
    assert.equal(resolveIpoStatus(upcomingSample), "upcoming");

    const listedSample = {
      openDate: "2026-10-10",
      closeDate: "2026-10-14",
      allotmentDate: "2026-10-17",
      listingDate: "2026-10-20",
    };
    assert.equal(resolveIpoStatus(listedSample), "listed");
  });

  it("computes accurate listing scenarios based on issue price and GMP", () => {
    const sc = calculateListingScenarios(700, 21, 320);
    assert.equal(sc.base.price, 1020);
    assert.equal(sc.base.profitPerLot, 6720);
    assert.ok(sc.base.gainPct > 40);

    assert.ok(sc.upside.price > sc.base.price);
    assert.ok(sc.downside.price < sc.base.price);
  });

  it("generates correct human-readable status labels", () => {
    assert.equal(ipoStatusLabel("open"), "Subscription Open");
    assert.equal(ipoStatusLabel("closed"), "Bidding Closed");
    assert.equal(ipoStatusLabel("upcoming"), "Upcoming");
    assert.equal(ipoStatusLabel("allotted"), "Allotment Done");
    assert.equal(ipoStatusLabel("listed"), "Listed");
  });

  it("calculates 5-factor AI composite score accurately", () => {
    const res = computeIpoScore({
      demandScore: 90,
      financialScore: 80,
      valuationScore: 75,
      gmpScore: 85,
      structureScore: 80,
    });
    // 90*0.3 + 80*0.25 + 75*0.2 + 85*0.15 + 80*0.1 = 27 + 20 + 15 + 12.75 + 8 = 82.75 -> 83
    assert.equal(res.score, 83);
    assert.equal(res.recommendation, "APPLY");
  });

  it("VERIFIED_IPOS has active Open, Upcoming, and Closed issues on the current system date", () => {
    assert.ok(VERIFIED_IPOS.length >= 15, `Expected at least 15 IPOs, found ${VERIFIED_IPOS.length}`);

    const withResolved = VERIFIED_IPOS.map((i) => ({ ...i, status: resolveIpoStatus(i) }));
    const openIpos = withResolved.filter((i) => i.status === "open");
    const upcomingIpos = withResolved.filter((i) => i.status === "upcoming");
    const closedIpos = withResolved.filter(
      (i) => i.status === "closed" || i.status === "allotted" || i.status === "listed",
    );

    // Verify Open tab has both Mainboard and SME
    assert.ok(openIpos.length >= 5, `Expected >= 5 open IPOs, got ${openIpos.length}`);
    assert.ok(openIpos.some((i) => i.category === "MAINBOARD"), "Open IPOs must include MAINBOARD");
    assert.ok(openIpos.some((i) => i.category === "SME"), "Open IPOs must include SME");

    // Verify Upcoming tab has both Mainboard and SME
    assert.ok(upcomingIpos.length >= 5, `Expected >= 5 upcoming IPOs, got ${upcomingIpos.length}`);
    assert.ok(upcomingIpos.some((i) => i.category === "MAINBOARD"), "Upcoming IPOs must include MAINBOARD");
    assert.ok(upcomingIpos.some((i) => i.category === "SME"), "Upcoming IPOs must include SME");

    // Verify Closed tab has both Mainboard and SME
    assert.ok(closedIpos.length >= 3, `Expected >= 3 closed IPOs, got ${closedIpos.length}`);
    assert.ok(closedIpos.some((i) => i.category === "MAINBOARD"), "Closed IPOs must include MAINBOARD");
    assert.ok(closedIpos.some((i) => i.category === "SME"), "Closed IPOs must include SME");

    // Verify data integrity of all records
    for (const ipo of VERIFIED_IPOS) {
      assert.ok(ipo.id, "IPO must have an id");
      assert.ok(ipo.symbol, "IPO must have a symbol");
      assert.ok(ipo.company, "IPO must have a company name");
      assert.ok(ipo.maxPrice > 0, "IPO maxPrice must be positive");
      assert.ok(ipo.lotSize > 0, "IPO lotSize must be positive");
      assert.ok(ipo.minInvestment === ipo.maxPrice * ipo.lotSize, `minInvestment must equal maxPrice * lotSize for ${ipo.symbol}`);
      assert.ok(ipo.financials.length > 0, `IPO ${ipo.symbol} must have audited financials`);
      assert.ok(ipo.aboutCompany, `IPO ${ipo.symbol} must have aboutCompany text`);
      assert.ok(ipo.businessModel, `IPO ${ipo.symbol} must have businessModel text`);
      assert.ok(ipo.strengths.length > 0, `IPO ${ipo.symbol} must have strengths`);
      assert.ok(ipo.risks.length > 0, `IPO ${ipo.symbol} must have risks`);
    }
  });
});
