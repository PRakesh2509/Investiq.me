import type { IPO } from "./ipos";
import type { FinancialRow, GmpPoint, QuantResult, SubscriptionMultiples } from "./ipo-quant";

export type Verdict = "STRONG APPLY" | "APPLY" | "APPLY WITH CAUTION" | "AVOID";
export type Confidence = "High" | "Medium" | "Low";

export interface ScoreLine {
  key: string;
  label: string;
  weight: number; // percent
  score: number; // 0-10
  rationale: string;
}

export interface EvidenceItem {
  point: string;
  evidence: string;
}

export interface IpoResearch {
  company: string;
  sector: string;
  issueSize: string;
  freshIssuePct: string;
  ofsPct: string;
  priceBand: string;
  postIssuePe: string;
  scores: ScoreLine[];
  weightedTotal: number; // 0-100
  redFlags: string[];
  strengths: EvidenceItem[];
  concerns: EvidenceItem[];
  verdict: Verdict;
  confidence: Confidence;
  outcomeRange: string;
  deepChecks: Array<{ q: string; a: string }>;
  dataGaps: string[];
  aiPowered: boolean;
  /** Condensed brief used for the Telegram card */
  businessSummary: string;
  highlights: string[];
  valuationSummary: string;
  finalReview: string;
  listingGain: string;
  expectedReturns: string;
  plFiveYear: string;
  /** Transparent 5-factor quantitative model — independently computed per company. */
  quant: QuantResult;
  gmpHistory: GmpPoint[];
  subscription: SubscriptionMultiples;
  financialTable: FinancialRow[];
  aboutBusiness: string;
  moatOneLiner: string;
  moatBullets: string[];
}

export const CATEGORIES: Array<{ key: string; label: string; weight: number }> = [
  { key: "business", label: "Business & Industry", weight: 15 },
  { key: "promoters", label: "Promoters & Management", weight: 12 },
  { key: "financials", label: "Financial Strength", weight: 18 },
  { key: "cashflow", label: "Cash Flow & Earnings Quality", weight: 12 },
  { key: "valuation", label: "IPO Valuation", weight: 15 },
  { key: "structure", label: "IPO Structure", weight: 10 },
  { key: "position", label: "Industry Position", weight: 8 },
  { key: "institutional", label: "Institutional Confidence", weight: 7 },
  { key: "risk", label: "Risk Factors", weight: 3 },
];

export const DEEP_CHECK_QUESTIONS = [
  "Customer count / revenue-per-customer growth YoY",
  "Cash-flow growth vs profit growth",
  "Promoter capital-allocation history",
  "Consistency of management commentary",
  "Pricing power evidence",
  "Operating leverage evidence",
  "Is capacity expansion already funded?",
  "Realistic moat vs a well-funded new entrant",
  "Most material RHP risk factors (plain language)",
];

export function verdictEmoji(v: Verdict): string {
  if (v === "STRONG APPLY") return "🟢";
  if (v === "APPLY") return "🟢";
  if (v === "APPLY WITH CAUTION") return "🟡";
  return "🔴";
}

export function computeWeightedTotal(scores: ScoreLine[]): number {
  const total = scores.reduce((s, c) => s + (c.score / 10) * c.weight, 0);
  return Math.round(total * 10) / 10;
}

/** Red-flag override: 2+ hard red flags caps the verdict. */
export function applyRedFlagOverride(verdict: Verdict, redFlags: string[]): Verdict {
  const hard = redFlags.filter((f) =>
    /auditor resign|customer concentration|investigat|pledg|litigation|fraud/i.test(f),
  );
  if (hard.length >= 2) return "AVOID";
  if (hard.length === 1 && (verdict === "STRONG APPLY" || verdict === "APPLY"))
    return "APPLY WITH CAUTION";
  return verdict;
}

export function verdictFromScore(total: number): Verdict {
  if (total >= 75) return "STRONG APPLY";
  if (total >= 62) return "APPLY";
  if (total >= 48) return "APPLY WITH CAUTION";
  return "AVOID";
}

/**
 * AVOID must be evidence-driven, never a by-product of missing data.
 * When most factors are unverified and no hard red flag exists, the honest
 * call is APPLY WITH CAUTION at Low confidence.
 */
export function guardAgainstDataStarvedAvoid(
  verdict: Verdict,
  redFlags: string[],
  scores: ScoreLine[],
): Verdict {
  if (verdict !== "AVOID") return verdict;
  const hard = redFlags.filter((f) =>
    /auditor resign|customer concentration|investigat|pledg|litigation|fraud|negative (ocf|cash)/i.test(
      f,
    ),
  );
  if (hard.length >= 1) return "AVOID";
  const unverified = scores.filter((s) =>
    /unverified|not available|no data/i.test(s.rationale),
  ).length;
  if (unverified >= 4) return "APPLY WITH CAUTION";
  return verdict;
}

const RULE = "━━━━━━━━━━━━━━━━━━━━";
const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Telegram card following the user's mandated OUTPUT FORMAT, verbatim in order. */
export function formatResearchForTelegram(r: IpoResearch, ipo: IPO): string {
  const L: string[] = [];
  L.push(`<b>${esc(r.company)}</b>`);
  L.push(``);
  L.push(`<b>About</b>`);
  L.push(`${esc(r.businessSummary || "—")}`);
  L.push(`<i>Sector: ${esc(r.sector)}</i>`);
  L.push(``);
  L.push(RULE);
  L.push(``);
  L.push(`<b>Key points</b>`);
  (r.highlights?.length ? r.highlights : ["—"]).slice(0, 5).forEach((h) => L.push(`• ${esc(h)}`));
  L.push(``);
  L.push(RULE);
  L.push(``);
  L.push(`<b>Price &amp; valuation</b>`);
  L.push(`Price band: ${esc(r.priceBand)}`);
  L.push(`Issue size: ${esc(r.issueSize)}  |  P/E: ${esc(r.postIssuePe)}`);
  L.push(`${esc(r.valuationSummary || "—")}`);
  L.push(``);
  L.push(RULE);
  L.push(``);
  L.push(`<b>Pros — 5-year P&amp;L</b>`);
  L.push(`${esc(r.plFiveYear || "—")}`);
  L.push(``);
  L.push(RULE);
  L.push(``);
  L.push(`${verdictEmoji(r.verdict)} <b>Final review: ${esc(r.verdict)}</b>`);
  L.push(`Listing gain: ${esc(r.listingGain || "—")}`);
  L.push(`Expected returns: ${esc(r.expectedReturns || "—")}`);
  L.push(`${esc(r.finalReview || "—")}`);
  L.push(``);
  L.push(
    `<i>Dates: ${ipo.openDate || "—"} → ${ipo.closeDate || "—"} · Listing ${ipo.listingDate || "—"}</i>`,
  );
  L.push(`<i>Information only, not SEBI-registered advice.</i>`);
  return L.join("\n");
}

/** Telegram hard-limits a message at 4096 chars — split on section rules. */
export function splitForTelegram(text: string, limit = 3800): string[] {
  if (text.length <= limit) return [text];
  const lines = text.split("\n");
  const out: string[] = [];
  let buf = "";
  for (const line of lines) {
    if ((buf + "\n" + line).length > limit) {
      out.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}
