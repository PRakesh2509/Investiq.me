/**
 * Transparent 5-factor IPO scoring model (out of 100).
 * Every IPO is scored independently from its own inputs — there is no default
 * or shared recommendation label anywhere in this file.
 */

export type QuantRecommendation = "APPLY" | "APPLY WITH CAUTION" | "AVOID / NEUTRAL";

export interface SubscriptionMultiples {
  qib: number | null;
  nii: number | null;
  retail: number | null;
  overall: number | null;
  verified: boolean;
}

export interface GmpPoint {
  date: string;
  premium: number;
}

export interface FinancialRow {
  fy: string;
  revenueCr: number | null;
  patCr: number | null;
  debtToEquity: number | null;
  promoterHoldingPct: number | null;
  estimate: boolean;
}

export interface QuantInputs {
  gmpHistory: GmpPoint[];
  gmpVerified: boolean;
  subscription: SubscriptionMultiples;
  financials: FinancialRow[];
  financialsVerified: boolean;
  revenueGrowthPct: number | null;
  patMarginPct: number | null;
  debtToEquity: number | null;
  roePct: number | null;
  /** Share of the FY history with positive PAT (0-100) — derived from past-year results. */
  profitableYearsPct?: number | null;

  peRatio: number | null;
  peerPeRatio: number | null;
  valuationVerified: boolean;
  issueSizeCr: number | null;
  priceBandUpper: number | null;
}

export interface FactorScore {
  key: string;
  label: string;
  weight: number;
  points: number; // 0..weight
  rationale: string;
  estimate: boolean;
  /** False when the factor had no usable input and was filled at the neutral midpoint. */
  informative: boolean;
}

export interface QuantResult {
  factors: FactorScore[];
  composite: number; // 0..100
  recommendation: QuantRecommendation;
  confidence: "High" | "Medium" | "Low";
  gainRange: string;
  explanation: string;
}

export const FACTOR_WEIGHTS = {
  gmp: 25,
  demand: 30,
  financials: 20,
  valuation: 15,
  issueSize: 10,
} as const;

/** An unknown factor is scored at the midpoint of the caution band, never punitively. */
const NEUTRAL = 0.55;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

/** GMP trend — 25%: level relative to price band plus slope over the series. */
function scoreGmp(i: QuantInputs): FactorScore {
  const w = FACTOR_WEIGHTS.gmp;
  const series = i.gmpHistory.filter((p) => Number.isFinite(p.premium));
  const informative = series.length >= 2 && series.some((p) => p.premium !== 0);
  if (!informative) {
    return {
      key: "gmp",
      label: "GMP Trend",
      weight: w,
      points: round1(w * NEUTRAL),
      rationale:
        "No grey-market data available — excluded from the composite instead of dragging it to neutral.",
      estimate: true,
      informative: false,
    };
  }
  const last = series[series.length - 1].premium;
  const first = series[0].premium;
  const band = i.priceBandUpper && i.priceBandUpper > 0 ? i.priceBandUpper : null;
  // Level: GMP as % of upper band; 0% → 0.15, 25%+ → 1.0
  const pct = band ? (last / band) * 100 : last > 0 ? 12 : 0;
  // Calibrated to Indian mainboard reality: ~15% of the cap is a strong premium,
  // 8-10% healthy, flat/negative weak.
  const level = clamp01(0.1 + (pct / 15) * 0.9);
  // Slope: rising series rewarded, decaying punished.
  const slope =
    first === 0 ? (last > 0 ? 1 : 0.5) : clamp01(0.5 + (last - first) / (Math.abs(first) * 2));
  const ratio = clamp01(level * 0.65 + slope * 0.35);
  return {
    key: "gmp",
    label: "GMP Trend",
    weight: w,
    points: round1(w * ratio),
    rationale: `Latest premium ₹${last.toFixed(0)}${band ? ` (${pct.toFixed(1)}% of the ₹${band} cap)` : ""}, trend ${last >= first ? "firm/rising" : "cooling"} across ${series.length} sessions.`,
    estimate: !i.gmpVerified,
    informative: true,
  };
}

/** Subscription demand — 30%: QIB weighted heaviest, then NII, retail, overall. */
function scoreDemand(i: QuantInputs): FactorScore {
  const w = FACTOR_WEIGHTS.demand;
  const s = i.subscription;
  const vals = [s.qib, s.nii, s.retail, s.overall].filter((x): x is number =>
    Number.isFinite(x as number),
  );
  if (vals.length === 0) {
    return {
      key: "demand",
      label: "Subscription Demand",
      weight: w,
      points: round1(w * NEUTRAL),
      rationale:
        "Category-wise subscription not published yet — excluded from the composite until live NSE/BSE bid data arrives.",
      estimate: true,
      informative: false,
    };
  }
  // Each multiple mapped: 0x → 0, 1x → 0.35, 5x → 0.7, 20x+ → 1.0
  const curve = (x: number | null, fallback = 0.45) => {
    if (!Number.isFinite(x as number)) return fallback;
    const v = x as number;
    if (v <= 1) return clamp01(v * 0.35);
    if (v <= 5) return 0.35 + ((v - 1) / 4) * 0.35;
    if (v <= 20) return 0.7 + ((v - 5) / 15) * 0.3;
    return 1;
  };
  const ratio = clamp01(
    curve(s.qib) * 0.4 + curve(s.nii) * 0.25 + curve(s.retail) * 0.15 + curve(s.overall) * 0.2,
  );
  const f = (x: number | null) =>
    Number.isFinite(x as number) ? `${(x as number).toFixed(2)}x` : "n/a";
  return {
    key: "demand",
    label: "Subscription Demand",
    weight: w,
    points: round1(w * ratio),
    rationale: `QIB ${f(s.qib)} · NII ${f(s.nii)} · Retail ${f(s.retail)} · Overall ${f(s.overall)}.`,
    estimate: !s.verified,
    informative: true,
  };
}

/** Financial health — 20%: revenue growth, PAT margin, D/E, ROE. */
function scoreFinancials(i: QuantInputs): FactorScore {
  const w = FACTOR_WEIGHTS.financials;
  const parts: number[] = [];
  const notes: string[] = [];
  if (Number.isFinite(i.revenueGrowthPct as number)) {
    const g = i.revenueGrowthPct as number;
    parts.push(clamp01((g + 5) / 35));
    notes.push(`revenue growth ${g.toFixed(1)}%`);
  }
  if (Number.isFinite(i.patMarginPct as number)) {
    const m = i.patMarginPct as number;
    // Piecewise so a normal-margin manufacturer is not treated as distressed.
    const mScore =
      m <= 0
        ? clamp01(0.1 + m / 20)
        : m <= 5
          ? 0.1 + (m / 5) * 0.4
          : m <= 10
            ? 0.5 + ((m - 5) / 5) * 0.2
            : clamp01(0.7 + ((m - 10) / 10) * 0.3);
    parts.push(mScore);
    notes.push(`PAT margin ${m.toFixed(1)}%`);
  }
  if (Number.isFinite(i.debtToEquity as number)) {
    const d = i.debtToEquity as number;
    parts.push(clamp01(1 - d / 1.5));
    notes.push(`D/E ${d.toFixed(2)}`);
  }
  if (Number.isFinite(i.roePct as number)) {
    const r = i.roePct as number;
    parts.push(clamp01(r / 25));
    notes.push(`ROE ${r.toFixed(1)}%`);
  }
  if (Number.isFinite(i.profitableYearsPct as number)) {
    const p = i.profitableYearsPct as number;
    parts.push(clamp01(p / 100));
    notes.push(`${p.toFixed(0)}% of past FYs profitable`);
  }
  const ratio = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : NEUTRAL;

  return {
    key: "financials",
    label: "Financial Health",
    weight: w,
    points: round1(w * ratio),
    rationale: notes.length
      ? notes.join(" · ")
      : "Financial ratios not retrievable — excluded from the composite.",
    estimate: !i.financialsVerified || parts.length < 3,
    informative: parts.length > 0,
  };
}

/** Valuation vs peers — 15%: discount to peer P/E scores best. */
function scoreValuation(i: QuantInputs): FactorScore {
  const w = FACTOR_WEIGHTS.valuation;
  const pe = i.peRatio;
  const peer = i.peerPeRatio;
  if (!Number.isFinite(pe as number) || !Number.isFinite(peer as number) || (peer as number) <= 0) {
    const soloRatio = Number.isFinite(pe as number)
      ? clamp01(1 - ((pe as number) - 15) / 60)
      : NEUTRAL;
    return {
      key: "valuation",
      label: "Valuation vs Peers",
      weight: w,
      points: round1(w * soloRatio),
      rationale: Number.isFinite(pe as number)
        ? `Post-issue P/E ${(pe as number).toFixed(1)}x; no clean listed peer multiple to compare against.`
        : "Peer multiples unavailable — excluded from the composite.",
      estimate: true,
      informative: Number.isFinite(pe as number),
    };
  }
  const rel = (pe as number) / (peer as number); // <1 = discount
  // rel 0.75 → 0.79 · parity → 0.60 · 50% premium → 0.23
  const ratio = clamp01(1.35 - rel * 0.75);
  return {
    key: "valuation",
    label: "Valuation vs Peers",
    weight: w,
    points: round1(w * ratio),
    rationale: `P/E ${(pe as number).toFixed(1)}x vs peer set ${(peer as number).toFixed(1)}x — ${rel < 1 ? `${((1 - rel) * 100).toFixed(0)}% discount` : `${((rel - 1) * 100).toFixed(0)}% premium`}.`,
    estimate: !i.valuationVerified,
    informative: true,
  };
}

/** Issue size moderation — 10%: smaller issues absorb listing-day supply better. */
function scoreIssueSize(i: QuantInputs): FactorScore {
  const w = FACTOR_WEIGHTS.issueSize;
  const cr = i.issueSizeCr;
  if (!Number.isFinite(cr as number) || (cr as number) <= 0) {
    return {
      key: "issueSize",
      label: "Issue Size Moderation",
      weight: w,
      points: round1(w * NEUTRAL),
      rationale: "Issue size in ₹ Cr not disclosed in the feed — excluded from the composite.",
      estimate: true,
      informative: false,
    };
  }
  const v = cr as number;
  // ≤300 Cr → 1.0, 1000 Cr → 0.75, 5000 Cr → 0.4, ≥15000 Cr → 0.15
  const ratio =
    v <= 300
      ? 1
      : v <= 1000
        ? 1 - ((v - 300) / 700) * 0.25
        : v <= 5000
          ? 0.75 - ((v - 1000) / 4000) * 0.35
          : clamp01(0.4 - ((v - 5000) / 10000) * 0.25);
  return {
    key: "issueSize",
    label: "Issue Size Moderation",
    weight: w,
    points: round1(w * ratio),
    rationale: `₹${v.toLocaleString("en-IN")} Cr issue — ${v <= 1000 ? "moderate absorption risk" : v <= 5000 ? "sizeable, needs institutional support" : "very large, listing-day supply pressure"}.`,
    estimate: false,
    informative: true,
  };
}

export function recommendationFromComposite(score: number): {
  recommendation: QuantRecommendation;
} {
  if (score >= 68) return { recommendation: "APPLY" };
  if (score >= 50) return { recommendation: "APPLY WITH CAUTION" };
  return { recommendation: "AVOID / NEUTRAL" };
}

function gainRangeFor(score: number): string {
  if (score >= 85) return "+25% to +45%";
  if (score >= 75) return "+15% to +32%";
  if (score >= 65) return "+8% to +20%";
  if (score >= 55) return "+2% to +12%";
  if (score >= 45) return "−5% to +8%";
  return "−15% to 0%";
}

export function computeQuant(inputs: QuantInputs): QuantResult {
  const factors = [
    scoreGmp(inputs),
    scoreDemand(inputs),
    scoreFinancials(inputs),
    scoreValuation(inputs),
    scoreIssueSize(inputs),
  ];
  // Composite is scored ONLY on factors that actually had data, renormalised to
  // 100. That keeps a well-documented company from being dragged to the neutral
  // midpoint by fields the feed has not published yet — and stops every issue
  // from landing on the same middling label.
  const scored = factors.filter((f) => f.informative);
  const coveredWeight = scored.reduce((s, f) => s + f.weight, 0);
  const composite = coveredWeight
    ? Math.round((scored.reduce((s, f) => s + f.points, 0) / coveredWeight) * 100)
    : 50;
  const coverage = coveredWeight / 100;
  const { recommendation } = recommendationFromComposite(composite);
  const verifiedWeight = factors
    .filter((f) => f.informative && !f.estimate)
    .reduce((s, f) => s + f.weight, 0);
  const confidence: QuantResult["confidence"] =
    coverage >= 0.7 && verifiedWeight >= 30 ? "High" : coverage >= 0.45 ? "Medium" : "Low";
  const tier = `${confidence} confidence`;
  const ranked = [...(scored.length ? scored : factors)].sort(
    (a, b) => b.points / b.weight - a.points / a.weight,
  );
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const estimated = scored.filter((f) => f.estimate).map((f) => f.label);
  const missing = factors.filter((f) => !f.informative).map((f) => f.label);
  const explanation = [
    `Composite ${composite}/100 → ${recommendation} (${tier}), scored on ${Math.round(coverage * 100)}% of the model weight that has usable data.`,
    `Strongest factor: ${best.label} at ${best.points}/${best.weight} — ${best.rationale}`,
    `Weakest factor: ${worst.label} at ${worst.points}/${worst.weight} — ${worst.rationale}`,
    missing.length ? `Excluded for lack of data: ${missing.join(", ")}.` : "",
    estimated.length
      ? `Estimated inputs (not filing-verified): ${estimated.join(", ")}.`
      : "All scored factors used verified inputs.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    factors,
    composite,
    recommendation,
    confidence,
    gainRange: gainRangeFor(composite),
    explanation,
  };
}

/**
 * Derive trend metrics from the company's own multi-year FY history.
 * Revenue growth = CAGR across the earliest→latest FY with data (YoY when only
 * two years exist). PAT margin = latest FY PAT / latest FY revenue.
 * D/E = latest FY value. Consistency = share of FYs with positive PAT.
 */
export function deriveFinancialTrends(rows: FinancialRow[]): {
  revenueGrowthPct: number | null;
  patMarginPct: number | null;
  debtToEquity: number | null;
  profitableYearsPct: number | null;
  years: number;
} {
  const rev = rows.filter(
    (r) => Number.isFinite(r.revenueCr as number) && (r.revenueCr as number) > 0,
  );
  let revenueGrowthPct: number | null = null;
  if (rev.length >= 2) {
    const first = rev[0].revenueCr as number;
    const last = rev[rev.length - 1].revenueCr as number;
    const n = rev.length - 1;
    revenueGrowthPct = round1((Math.pow(last / first, 1 / n) - 1) * 100);
  }
  const latestRev = rev[rev.length - 1];
  const patMarginPct =
    latestRev && Number.isFinite(latestRev.patCr as number)
      ? round1(((latestRev.patCr as number) / (latestRev.revenueCr as number)) * 100)
      : null;
  const de = [...rows].reverse().find((r) => Number.isFinite(r.debtToEquity as number));
  const patRows = rows.filter((r) => Number.isFinite(r.patCr as number));
  const profitableYearsPct = patRows.length
    ? round1((patRows.filter((r) => (r.patCr as number) > 0).length / patRows.length) * 100)
    : null;
  return {
    revenueGrowthPct,
    patMarginPct,
    debtToEquity: de ? (de.debtToEquity as number) : null,
    profitableYearsPct,
    years: rows.length,
  };
}

export function parsePriceBandUpper(band: string): number | null {
  const nums = (band || "").replace(/,/g, "").match(/\d+(\.\d+)?/g);
  if (!nums?.length) return null;
  return Math.max(...nums.map(Number));
}

/** "₹2,400 Cr" / "12.34 Cr shares" → ₹ Cr number where possible. */
export function parseIssueSizeCr(size: string, priceBandUpper: number | null): number | null {
  if (!size) return null;
  const clean = size.replace(/,/g, "");
  const shareMatch = clean.match(/(\d+(\.\d+)?)\s*Cr\s*shares/i);
  if (shareMatch && priceBandUpper) return Number(shareMatch[1]) * priceBandUpper;
  const rupeeMatch = clean.match(/₹?\s*(\d+(\.\d+)?)\s*Cr/i);
  if (rupeeMatch) return Number(rupeeMatch[1]);
  return null;
}
