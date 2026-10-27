export type IpoCategory = "MAINBOARD" | "SME";
export type IpoStatus = "open" | "closed" | "upcoming" | "allotted" | "listed";

export interface IpoSubscription {
  qib: number | null;
  nii: number | null;
  retail: number | null;
  total: number | null;
  updatedAt?: string;
}

export interface IpoFinancials {
  fy: string;
  revenueCr: number;
  patCr: number;
  ebitdaCr?: number;
  ebitdaMarginPct?: number;
  debtToEquity?: number;
  roePct?: number;
  rocePct?: number;
}

export interface IpoPeerComparison {
  name: string;
  pe: number;
  revenueCr: number;
  patCr: number;
  marketCapCr?: number;
}

export interface IpoScoringFactors {
  demand: { score: number; weight: number; rationale: string }; // 30%
  financials: { score: number; weight: number; rationale: string }; // 25%
  valuation: { score: number; weight: number; rationale: string }; // 20%
  gmp: { score: number; weight: number; rationale: string }; // 15%
  structure: { score: number; weight: number; rationale: string }; // 10%
}

export interface IPO {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  category: IpoCategory; // "MAINBOARD" | "SME"
  exchange: "NSE" | "BSE" | "NSE & BSE" | "NSE Emerge" | "BSE SME";
  priceBand: string; // e.g. "₹665 – ₹700"
  minPrice: number;
  maxPrice: number;
  lotSize: number;
  minInvestment: number; // e.g. maxPrice * lotSize
  issueSize: string; // e.g. "₹597 Cr"
  freshIssue: string; // e.g. "₹450 Cr"
  ofs: string; // e.g. "₹147 Cr"
  openDate: string; // ISO "YYYY-MM-DD"
  closeDate: string; // ISO "YYYY-MM-DD"
  allotmentDate: string; // ISO "YYYY-MM-DD"
  listingDate: string; // ISO "YYYY-MM-DD"
  status: IpoStatus;

  // GMP & Market Sentiment
  gmp: number | null;
  gmpPct: number | null;
  estListingPrice: number | null;
  gmpUpdated: string;
  gmpSource: string;

  // Subscription demand
  subscription: IpoSubscription;

  // Registrar & Application
  registrar: string;
  allotmentUrl: string;
  drhpUrl?: string;
  rhpUrl?: string;

  // AI Analysis & 5-Factor Scoring Engine (0-100)
  aiScore: number; // 0..100
  recommendation: "APPLY" | "NEUTRAL" | "AVOID";
  confidence: "High" | "Medium" | "Low";
  factors: IpoScoringFactors;

  // Listing Gain Scenarios
  scenarios: {
    downside: { price: number; gainPct: number; profitPerLot: number };
    base: { price: number; gainPct: number; profitPerLot: number };
    upside: { price: number; gainPct: number; profitPerLot: number };
  };

  // Company & Business Deep-Dive
  aboutCompany: string;
  businessModel: string;
  strengths: string[];
  risks: string[];
  financials: IpoFinancials[];
  peers: IpoPeerComparison[];
  useOfProceeds: string[];
  postIssuePe: number | null;
}
