import type { IPO } from "./ipos";
import {
  CATEGORIES,
  DEEP_CHECK_QUESTIONS,
  applyRedFlagOverride,
  guardAgainstDataStarvedAvoid,
  computeWeightedTotal,
  
  type IpoResearch,
  type ScoreLine,
  type Verdict,
} from "./ipo-research";
import {
  computeQuant,
  parseIssueSizeCr,
  parsePriceBandUpper,
  type FinancialRow,
  type GmpPoint,
  deriveFinancialTrends,
  type QuantInputs,

  type QuantResult,
  type SubscriptionMultiples,
} from "./ipo-quant";

const num = (x: any): number | null => {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (!s || /^(n\/?a|na|null|nil|unverified|unknown|-|—)$/i.test(s)) return null;
  const n = Number(s.replace(/[₹,%x\s]/gi, ""));
  return Number.isFinite(n) ? n : null;
};


function extractQuantInputs(raw: any, ipo: IPO, live: SubscriptionMultiples | null): QuantInputs {
  const q = raw?.quant ?? {};
  const priceBandUpper = parsePriceBandUpper(String(raw?.priceBand || ipo.priceBand || ""));
  const gmpHistory: GmpPoint[] = (Array.isArray(q.gmpHistory) ? q.gmpHistory : [])
    .map((p: any) => ({ date: String(p?.date ?? ""), premium: Number(p?.premium) }))
    .filter((p: GmpPoint) => p.date && Number.isFinite(p.premium))
    .slice(-10);
  const aiSub: SubscriptionMultiples = {
    qib: num(q?.subscription?.qib),
    nii: num(q?.subscription?.nii),
    retail: num(q?.subscription?.retail),
    overall: num(q?.subscription?.overall),
    verified: false,
  };
  const subscription =
    live && [live.qib, live.nii, live.retail, live.overall].some((v) => Number.isFinite(v as number) && (v as number) > 0)
      ? live
      : aiSub;
  const financials: FinancialRow[] = (Array.isArray(q.financials) ? q.financials : [])
    .map((r: any) => ({
      fy: String(r?.fy ?? ""),
      revenueCr: num(r?.revenueCr),
      patCr: num(r?.patCr),
      debtToEquity: num(r?.debtToEquity),
      promoterHoldingPct: num(r?.promoterHoldingPct),
      estimate: Boolean(r?.estimate ?? true),
    }))
    .filter((r: FinancialRow) => r.fy)
    .slice(-5);
  const issueSizeCr =
    num(q?.issueSizeCr) ?? parseIssueSizeCr(String(raw?.issueSize || ipo.issueSize || ""), priceBandUpper);
  const trend = deriveFinancialTrends(financials);
  return {
    gmpHistory,
    gmpVerified: false,
    subscription,
    financials,
    financialsVerified: Boolean(q?.financialsVerified) || financials.filter((r) => !r.estimate).length >= 3,
    revenueGrowthPct: num(q?.revenueGrowthPct) ?? trend.revenueGrowthPct,
    patMarginPct: num(q?.patMarginPct) ?? trend.patMarginPct,
    debtToEquity: num(q?.debtToEquity) ?? trend.debtToEquity,
    roePct: num(q?.roePct),
    profitableYearsPct: trend.profitableYearsPct,
    peRatio: num(q?.peRatio) ?? num(raw?.postIssuePe),
    peerPeRatio: num(q?.peerPeRatio),
    valuationVerified: Boolean(q?.valuationVerified),
    issueSizeCr,
    priceBandUpper,
  };
}


function verdictFromQuant(quant: QuantResult): Verdict {
  if (quant.composite >= 82) return "STRONG APPLY";
  if (quant.composite >= 68) return "APPLY";
  if (quant.composite >= 50) return "APPLY WITH CAUTION";
  return "AVOID";
}

/** Live category-wise subscription (bid) data from NSE, when the issue is open. */
async function fetchLiveSubscription(company: string): Promise<SubscriptionMultiples | null> {
  try {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
    const prime = await fetch("https://www.nseindia.com/market-data/issue-information", {
      headers: { "User-Agent": ua, Accept: "text/html" },
    });
    const cookie =
      prime.headers.getSetCookie?.()?.map((c) => c.split(";")[0]).join("; ") ??
      prime.headers.get("set-cookie")?.split(",").map((c) => c.split(";")[0]).join("; ") ??
      "";
    const res = await fetch("https://www.nseindia.com/api/ipo-current-issue", {
      headers: { "User-Agent": ua, Accept: "application/json", Cookie: cookie },
    });
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    const norm = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|private|pvt)\b|[^a-z0-9]/g, "");
    const target = norm(company);
    const mine = rows.filter((r) => norm(String(r?.companyName ?? r?.symbol ?? "")) === target);
    if (mine.length === 0) return null;
    const pick = (label: RegExp) => {
      const row = mine.find((r) => label.test(String(r?.category ?? "")));
      return row ? num(row?.noOfshareBid && row?.noOfshareOffered ? Number(row.noOfshareBid) / Number(row.noOfshareOffered) : row?.subscriptionTimes) : null;
    };
    const out: SubscriptionMultiples = {
      qib: pick(/qib|institutional/i),
      nii: pick(/nii|non institutional|hni/i),
      retail: pick(/retail|individual/i),
      overall: pick(/total|overall/i),
      verified: true,
    };
    return [out.qib, out.nii, out.retail, out.overall].some((v) => Number.isFinite(v as number) && (v as number) > 0) ? out : null;
  } catch {
    return null;
  }
}


const SYSTEM_PROMPT = `You are a senior IPO research analyst with 15+ years of experience, equivalent to a SEBI-registered research analyst (RA) at a top-tier institutional desk (Kotak Institutional Equities / Motilal Oswal / ICICI Securities research). You have reviewed 500+ DRHPs/RHPs. You are skeptical by default, evidence-driven, and you never let hype (GMP, social buzz, "everyone is applying") override fundamentals.

NON-NEGOTIABLE GROUND RULES
1. Never state a probability, gain % or verdict without showing the underlying evidence and reasoning.
2. Grey Market Premium is a sentiment indicator ONLY, max 5% influence on the final score. Never make it a primary signal.
3. If DRHP/RHP data is unavailable to you, say so explicitly and mark the factor "Unverified" — never fabricate numbers. Score an unverified factor NEUTRAL (5-6/10), never punitively low, and list it in dataGaps. A low score (<=4) must be justified by a specific negative data point you actually know; absence of data is NOT negative evidence.
4. Every conclusion must cite the specific data point it comes from. Label each as FACT (from filings), ESTIMATE (analyst projection) or OPINION (sentiment).
5. Distinguish facts, estimates and opinions clearly in the evidence strings.

SCORING FRAMEWORK — score each category 0-10:
1 Business & Industry (15%): model clarity/scalability, industry CAGR (flag <15%), TAM, moat, market share, revenue concentration (flag >40% from one segment), recurring vs one-time mix.
2 Promoters & Management (12%): litigation/regulatory history, post-IPO promoter holding (flag <50%), pledging (any pledge = red flag), governance/board independence, management track record, senior attrition.
3 Financial Strength (18%): revenue CAGR (flag <20%), PAT consistency, OCF trend, FCF trend, ROE/ROCE (flag <20%), EBITDA & net margin trend, D/E (flag >0.5), interest coverage (flag <5).
4 Cash Flow & Earnings Quality (12%): OCF vs PAT tracking, receivables vs revenue growth, inventory turnover, cash conversion cycle, one-time items inflating profit.
5 IPO Valuation (15%): P/E vs Indian AND global peers, EV/EBITDA, PEG (flag >1.5), premium/discount justification, implied growth priced in.
6 IPO Structure (10%): OFS vs fresh split (flag OFS >60%), use of proceeds quality, promoter stake retained.
7 Industry Position (8%): leader/challenger/laggard, entry barriers, policy tailwinds, export opportunity.
8 Institutional Confidence (7%): QIB subscription (weight above retail/HNI), anchor quality (marquee MFs/FIIs vs unknowns), analyst coverage.
9 Risk Factors (3%, can override): auditor resignation in last 3y, promoter pre-IPO share sales, related-party transactions, customer concentration >40%, single-supplier dependency, pending investigations, dilution history, contingent liabilities.

RED FLAG OVERRIDE: if 2+ hard red flags (auditor resignation, customer concentration >40%, pending investigation, heavy pledging) then verdict is capped at AVOID.

MANDATORY DEEP CHECKS — answer all nine, no skipping:
${DEEP_CHECK_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Verdict scale, mapped to the weighted total unless a red-flag override applies:
- 75-100 → STRONG APPLY
- 62-74.9 → APPLY
- 48-61.9 → APPLY WITH CAUTION
- below 48 → AVOID
AVOID must be evidence-driven. Issue AVOID only when you can cite concrete negatives (stretched valuation vs peers, declining/negative OCF, weak ROCE, OFS-heavy structure, governance issues) or 2+ hard red flags. If the company is simply not well documented in your knowledge, the correct call is APPLY WITH CAUTION with Low confidence — never a blanket AVOID. Do not default every issue to the same verdict; differentiate genuinely across issues.
Confidence: High / Medium / Low, tied to (a) data completeness and (b) red-flag count — never to GMP.
Expected outcome must be a RANGE with reasoning, never a single number, and must state that listing-day sentiment (not the fundamental score) is the main source of variance.

Return ONLY minified JSON, no markdown fences, matching exactly:
{"company":"","sector":"","issueSize":"","freshIssuePct":"","ofsPct":"","priceBand":"","postIssuePe":"","scores":[{"key":"business","score":0,"rationale":""}, ... all nine keys: business,promoters,financials,cashflow,valuation,structure,position,institutional,risk],"redFlags":[""],"strengths":[{"point":"","evidence":""}],"concerns":[{"point":"","evidence":""}],"verdict":"","confidence":"","outcomeRange":"","deepChecks":[{"q":"","a":""}],"dataGaps":[""],"businessSummary":"","highlights":["","","","",""],"valuationSummary":"","finalReview":"","listingGain":"","expectedReturns":"","plFiveYear":"","aboutBusiness":"","moatOneLiner":"","moatBullets":["","",""],"quant":{"gmpHistory":[{"date":"","premium":0}],"subscription":{"qib":null,"nii":null,"retail":null,"overall":null},"financials":[{"fy":"","revenueCr":0,"patCr":0,"debtToEquity":0,"promoterHoldingPct":0,"estimate":true}],"financialsVerified":false,"revenueGrowthPct":0,"patMarginPct":0,"debtToEquity":0,"roePct":0,"peRatio":0,"peerPeRatio":0,"valuationVerified":false,"issueSizeCr":0}}
Give exactly 3 strengths and 3 concerns, and 9 deepChecks matching the questions above (short q labels).
Also fill the condensed brief fields (these are what the user reads first):
- businessSummary: 1-2 sentences on what the company actually does and its sector.
- highlights: exactly 5 short bullet points (max ~15 words each) covering the most decision-relevant facts.
- valuationSummary: one line on listing price range and how the company is valued vs peers.
- plFiveYear: ONE sentence summarising revenue/profit-and-loss trend over the last five years.
- finalReview: 1-2 sentences saying whether to apply and why.
- listingGain: a short plausible range like "5-12% (scenario, not a forecast)".
- expectedReturns: short view on returns if held (e.g. "moderate over 12 months if margins hold").

ADDITIONALLY return a "quant" object with the raw NUMERIC inputs for a separate transparent 5-factor model (GMP 25%, Subscription Demand 30%, Financial Health 20%, Valuation vs Peers 15%, Issue Size Moderation 10%). This model needs numbers to work, so give your best analyst ESTIMATE for every field you can reason about (sector-typical margins, issue size in ₹ Cr implied by the price band and shares on offer, peer P/E for the sector, plausible GMP trajectory for an issue of this profile) and set the matching *Verified flag to false plus estimate:true so the UI labels it an estimate. Use null ONLY when you have no reasonable basis at all. Never present an estimate as filing-verified:
"quant":{"gmpHistory":[{"date":"YYYY-MM-DD","premium":0}],"subscription":{"qib":null,"nii":null,"retail":null,"overall":null},"financials":[{"fy":"FY22","revenueCr":null,"patCr":null,"debtToEquity":null,"promoterHoldingPct":null,"estimate":true}],"financialsVerified":false,"revenueGrowthPct":null,"patMarginPct":null,"debtToEquity":null,"roePct":null,"peRatio":null,"peerPeRatio":null,"valuationVerified":false,"issueSizeCr":null}
Also return "aboutBusiness" (2-3 sentences on what the company actually does), "moatOneLiner" (max 12 words) and "moatBullets" (exactly 3 bullets on why the company is/isn't profitable and its durable advantages). Give up to 5 financial rows, oldest first. Do NOT decide the final recommendation label yourself — the app computes it from these numbers.`;



function fallbackResearch(ipo: IPO, reason: string, live: SubscriptionMultiples | null = null): IpoResearch {
  const scores: ScoreLine[] = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    weight: c.weight,
    score: 5,
    rationale: "Unverified — DRHP/RHP data not retrievable at analysis time.",
  }));
  const weightedTotal = computeWeightedTotal(scores);
  // Still score the model on whatever is genuinely observable (issue size,
  // price band, live subscription) — never a hardcoded recommendation.
  const inputs = extractQuantInputs({}, ipo, live);
  const quant = computeQuant(inputs);
  return {
    company: ipo.company,
    sector: ipo.sector,
    issueSize: ipo.issueSize || "Unverified",
    freshIssuePct: "Unverified",
    ofsPct: "Unverified",
    priceBand: ipo.priceBand || "Unverified",
    postIssuePe: "Unverified",
    scores,
    weightedTotal,
    redFlags: [],
    strengths: [
      { point: "Listed on NSE mainboard issue calendar", evidence: "FACT: NSE public issue feed." },
    ],
    concerns: [
      { point: "Filing-level financials unverified", evidence: `FACT: analysis engine unavailable (${reason}).` },
    ],
    verdict: verdictFromQuant(quant),
    confidence: quant.confidence,
    outcomeRange:
      "Insufficient verified data to frame a fundamentals-based range. Do not act on this note until RHP financials are reviewed.",
    deepChecks: DEEP_CHECK_QUESTIONS.map((q) => ({ q, a: "Unverified — RHP data unavailable." })),
    dataGaps: ["Full DRHP/RHP financials, promoter and subscription data unavailable at run time."],
    aiPowered: false,
    businessSummary: `${ipo.company} — ${ipo.sector || "sector unverified"}. Business detail not retrievable at analysis time.`,
    highlights: [
      `Sector: ${ipo.sector || "Unverified"}`,
      `Issue size: ${ipo.issueSize || "Unverified"}`,
      `Price band: ${ipo.priceBand || "Unverified"}`,
      "Filing-level financials unverified",
      "Review the RHP before applying",
    ],
    valuationSummary: "Valuation vs peers unverified.",
    finalReview: "Insufficient verified data — apply only after reviewing the RHP.",
    listingGain: quant.gainRange,
    expectedReturns: "Unverified",
    plFiveYear: "Five-year profit and loss trend unavailable.",
    quant,
    gmpHistory: inputs.gmpHistory,
    subscription: inputs.subscription,
    financialTable: inputs.financials,
    aboutBusiness: `Business description for ${ipo.company} could not be retrieved (${reason}). Read the RHP before applying.`,
    moatOneLiner: "Moat assessment unavailable — estimate",
    moatBullets: ["Competitive-moat data unavailable at analysis time (estimate, not filing-verified)."],
  };
}


function coerce(raw: any, ipo: IPO, live: SubscriptionMultiples | null): IpoResearch {
  const inputs = extractQuantInputs(raw, ipo, live);
  const quant = computeQuant(inputs);

  const byKey = new Map<string, any>((raw?.scores ?? []).map((s: any) => [String(s.key), s]));
  const scores: ScoreLine[] = CATEGORIES.map((c) => {
    const s = byKey.get(c.key);
    const n = Number(s?.score);
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      score: Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n * 10) / 10)) : 5,
      rationale: String(s?.rationale ?? "Unverified.").slice(0, 400),
    };
  });
  const weightedTotal = computeWeightedTotal(scores);
  const redFlags: string[] = Array.isArray(raw?.redFlags)
    ? raw.redFlags.map((f: any) => String(f)).filter((f: string) => f && !/^none/i.test(f))
    : [];
  // The verdict is derived from this company's own composite score — the AI's
  // own label is only used as a tie-break sanity check, never as a default.
  let verdict: Verdict = verdictFromQuant(quant);
  verdict = applyRedFlagOverride(verdict, redFlags);
  verdict = guardAgainstDataStarvedAvoid(verdict, redFlags, scores);
  const conf = quant.confidence;
  const pair = (x: any) => ({ point: String(x?.point ?? ""), evidence: String(x?.evidence ?? "Unverified") });

  return {
    company: String(raw?.company || ipo.company),
    sector: String(raw?.sector || ipo.sector),
    issueSize: String(raw?.issueSize || ipo.issueSize || "Unverified"),
    freshIssuePct: String(raw?.freshIssuePct || "Unverified"),
    ofsPct: String(raw?.ofsPct || "Unverified"),
    priceBand: String(raw?.priceBand || ipo.priceBand || "Unverified"),
    postIssuePe: String(raw?.postIssuePe || "Unverified"),
    scores,
    weightedTotal,
    redFlags,
    strengths: (Array.isArray(raw?.strengths) ? raw.strengths : []).slice(0, 3).map(pair),
    concerns: (Array.isArray(raw?.concerns) ? raw.concerns : []).slice(0, 3).map(pair),
    verdict,
    confidence: conf as IpoResearch["confidence"],
    outcomeRange: String(
      raw?.outcomeRange ||
        "Fundamentals-based range unavailable; listing-day sentiment is the dominant variance driver.",
    ),
    deepChecks: (Array.isArray(raw?.deepChecks) ? raw.deepChecks : []).slice(0, 9).map((d: any, i: number) => ({
      q: String(d?.q || DEEP_CHECK_QUESTIONS[i] || ""),
      a: String(d?.a || "Unverified."),
    })),
    dataGaps: (Array.isArray(raw?.dataGaps) ? raw.dataGaps : []).map((g: any) => String(g)),
    aiPowered: true,
    businessSummary: String(raw?.businessSummary || `${ipo.company} — ${raw?.sector || ipo.sector || "sector unverified"}.`),
    highlights: (Array.isArray(raw?.highlights) ? raw.highlights : []).slice(0, 5).map((h: any) => String(h)),
    valuationSummary: String(raw?.valuationSummary || "Valuation vs peers unverified."),
    finalReview: String(raw?.finalReview || raw?.outcomeRange || "Review the RHP before applying."),
    listingGain: String(raw?.listingGain || "Scenario range unavailable"),
    expectedReturns: String(raw?.expectedReturns || "Unverified"),
    plFiveYear: String(raw?.plFiveYear || "Five-year profit and loss trend unavailable."),
    quant,
    gmpHistory: inputs.gmpHistory,
    subscription: inputs.subscription,
    financialTable: inputs.financials,
    aboutBusiness: String(raw?.aboutBusiness || raw?.businessSummary || "Business description unavailable."),
    moatOneLiner: String(raw?.moatOneLiner || "Moat assessment unavailable"),
    moatBullets: (Array.isArray(raw?.moatBullets) ? raw.moatBullets : []).slice(0, 3).map((b: any) => String(b)),
  };
}


export async function researchIpo(ipo: IPO): Promise<IpoResearch> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const key = geminiKey || lovableKey;
  const live = await fetchLiveSubscription(ipo.company);
  if (!key) return fallbackResearch(ipo, "AI key missing", live);

  const endpoint = geminiKey
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (geminiKey) {
    headers["Authorization"] = `Bearer ${geminiKey}`;
  } else {
    headers["Lovable-API-Key"] = lovableKey!;
  }

  const model = geminiKey ? "gemini-3.8-flash" : "google/gemini-3.6-flash";

  const userPrompt = `Produce the full research note for this Indian IPO using everything you know about the company, its sector, its filings and comparable listed peers. Today's date: ${new Date().toISOString().slice(0, 10)}.

Company: ${ipo.company}
Sector (feed label): ${ipo.sector}
Price band (feed): ${ipo.priceBand || "not disclosed in feed"}
Issue size (feed): ${ipo.issueSize || "not disclosed in feed"}
Lot size (feed): ${ipo.lotSize || "not disclosed"}
Open: ${ipo.openDate || "—"} | Close: ${ipo.closeDate || "—"} | Allotment: ${ipo.allotmentDate || "—"} | Listing: ${ipo.listingDate || "—"}
Status: ${ipo.status}
${live ? `Live NSE subscription (authoritative, use these): QIB ${live.qib ?? "n/a"}x, NII ${live.nii ?? "n/a"}x, Retail ${live.retail ?? "n/a"}x, Overall ${live.overall ?? "n/a"}x` : "Live NSE subscription data not available for this issue."}

QUANT BLOCK IS MANDATORY AND MUST BE NUMERIC. Using your knowledge of this company and its sector, fill EVERY field of "quant" with your best analyst number:
- "financials": 3-5 FY rows, oldest first, each with revenueCr, patCr, debtToEquity and promoterHoldingPct as numbers (never null). These past-year results drive the Financial Health factor, so they must reflect this company's actual trajectory as you know it (or a clearly-reasoned sector-calibrated estimate) — do not copy generic numbers across companies.
- revenueGrowthPct (CAGR over those FYs), patMarginPct (latest FY), debtToEquity, roePct: numbers.
- peRatio (post-issue) and peerPeRatio (median listed peer of the same sub-sector): numbers.
- issueSizeCr: number implied by the price band and shares on offer.
- gmpHistory: 5-8 dated points with your best-estimate premium trajectory for an issue of this profile; use an empty array only if you truly have no basis.
- subscription: keep null unless live data was given above.
Set the *Verified flags false and estimate true for anything not filing-verified, and list those in dataGaps. Never leave a numeric quant field null when a reasoned estimate is possible — differentiate genuinely between companies rather than returning the same neutral profile.`;

  let lastError = "unknown";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        lastError = `gateway HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
        continue;
      }
      const json: any = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start === -1 || end <= start) throw new Error("no JSON object in response");
      const parsed = JSON.parse(content.slice(start, end + 1));
      return coerce(parsed, ipo, live);
    } catch (e) {
      lastError = (e as Error).message;
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }
  return fallbackResearch(ipo, lastError, live);
}

