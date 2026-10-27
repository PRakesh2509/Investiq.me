import type { IpoStatus } from "./types";

export function calculateListingScenarios(issuePrice: number, lotSize: number, gmp: number | null) {
  const premium = gmp ?? 0;
  const basePrice = Math.round(issuePrice + premium);
  const baseGainPct = +(((basePrice - issuePrice) / issuePrice) * 100).toFixed(2);
  const baseProfit = Math.round((basePrice - issuePrice) * lotSize);

  // Downside scenario: conservative 15-20% discount on GMP or small cut below issue price if GMP is weak
  const downsidePrice = Math.round(premium > 0 ? issuePrice + premium * 0.35 : issuePrice * 0.94);
  const downsideGainPct = +(((downsidePrice - issuePrice) / issuePrice) * 100).toFixed(2);
  const downsideProfit = Math.round((downsidePrice - issuePrice) * lotSize);

  // Upside scenario: strong listing day momentum (+25-30% above base)
  const upsidePrice = Math.round(premium > 0 ? issuePrice + premium * 1.35 : issuePrice * 1.12);
  const upsideGainPct = +(((upsidePrice - issuePrice) / issuePrice) * 100).toFixed(2);
  const upsideProfit = Math.round((upsidePrice - issuePrice) * lotSize);

  return {
    downside: { price: downsidePrice, gainPct: downsideGainPct, profitPerLot: downsideProfit },
    base: { price: basePrice, gainPct: baseGainPct, profitPerLot: baseProfit },
    upside: { price: upsidePrice, gainPct: upsideGainPct, profitPerLot: upsideProfit },
  };
}

export function computeIpoScore(factors: {
  demandScore: number; // 0-100
  financialScore: number; // 0-100
  valuationScore: number; // 0-100
  gmpScore: number; // 0-100
  structureScore: number; // 0-100
  redFlagsCount?: number;
}): { score: number; recommendation: "APPLY" | "NEUTRAL" | "AVOID" } {
  const total = Math.round(
    factors.demandScore * 0.3 +
      factors.financialScore * 0.25 +
      factors.valuationScore * 0.2 +
      factors.gmpScore * 0.15 +
      factors.structureScore * 0.1,
  );

  let recommendation: "APPLY" | "NEUTRAL" | "AVOID" = "NEUTRAL";
  if ((factors.redFlagsCount ?? 0) >= 2 || total < 45) {
    recommendation = "AVOID";
  } else if (total >= 65 && (factors.redFlagsCount ?? 0) === 0) {
    recommendation = "APPLY";
  }

  return { score: total, recommendation };
}

export function resolveIpoStatus(ipo: {
  openDate: string;
  closeDate: string;
  allotmentDate?: string;
  listingDate?: string;
  status?: IpoStatus;
}): IpoStatus {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const now = t.getTime();
  const day = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).getTime() : NaN);

  const listing = day(ipo.listingDate || "");
  const allot = day(ipo.allotmentDate || "");
  const close = day(ipo.closeDate || "");
  const open = day(ipo.openDate || "");

  if (Number.isFinite(listing) && now >= listing) return "listed";
  if (Number.isFinite(allot) && now >= allot) return "allotted";
  if (Number.isFinite(close) && now > close) return "closed";
  if (Number.isFinite(open) && now >= open) return "open";
  if (Number.isFinite(open) && now < open) return "upcoming";
  return ipo.status || "upcoming";
}

export function ipoStatusLabel(s: IpoStatus): string {
  switch (s) {
    case "open":
      return "Subscription Open";
    case "closed":
      return "Bidding Closed";
    case "upcoming":
      return "Upcoming";
    case "allotted":
      return "Allotment Done";
    case "listed":
      return "Listed";
  }
}
