// Mocked IPO calendar. In production this would come from an NSE/BSE data feed.
export interface IPO {
  id: string;
  company: string;
  sector: string;
  priceBand: string;   // e.g. "₹580 – ₹610"
  lotSize: number;
  issueSize: string;   // e.g. "₹2,400 Cr"
  openDate: string;    // ISO
  closeDate: string;   // ISO
  allotmentDate: string;
  listingDate: string;
  status: "upcoming" | "open" | "closed" | "allotted" | "listed";
}

const today = () => new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const IPOS: IPO[] = [
  {
    id: "ipo-swiggy",
    company: "Swiggy Ltd",
    sector: "Consumer Tech",
    priceBand: "₹371 – ₹390",
    lotSize: 38,
    issueSize: "₹11,327 Cr",
    openDate: iso(addDays(today(), -1)),
    closeDate: iso(addDays(today(), 2)),
    allotmentDate: iso(addDays(today(), 5)),
    listingDate: iso(addDays(today(), 8)),
    status: "open",
  },
  {
    id: "ipo-deepak-builders",
    company: "Deepak Builders & Engineers India Ltd",
    sector: "Infrastructure / EPC",
    priceBand: "₹192 – ₹203",
    lotSize: 73,
    issueSize: "₹260 Cr",
    openDate: iso(addDays(today(), 1)),
    closeDate: iso(addDays(today(), 3)),
    allotmentDate: iso(addDays(today(), 6)),
    listingDate: iso(addDays(today(), 9)),
    status: "upcoming",
  },
  {
    id: "ipo-waaree-energies",
    company: "Waaree Energies Ltd",
    sector: "Solar Energy / Clean Tech",
    priceBand: "₹1,427 – ₹1,503",
    lotSize: 9,
    issueSize: "₹4,321 Cr",
    openDate: iso(addDays(today(), 2)),
    closeDate: iso(addDays(today(), 4)),
    allotmentDate: iso(addDays(today(), 7)),
    listingDate: iso(addDays(today(), 10)),
    status: "upcoming",
  },
  {
    id: "ipo-godavari-biorefineries",
    company: "Godavari Biorefineries Ltd",
    sector: "Bio-Refining / Green Chemicals",
    priceBand: "₹334 – ₹352",
    lotSize: 42,
    issueSize: "₹555 Cr",
    openDate: iso(addDays(today(), 5)),
    closeDate: iso(addDays(today(), 7)),
    allotmentDate: iso(addDays(today(), 10)),
    listingDate: iso(addDays(today(), 13)),
    status: "upcoming",
  },
  {
    id: "ipo-afcons-infra",
    company: "Afcons Infrastructure Ltd",
    sector: "Heavy Infrastructure / Engineering",
    priceBand: "₹440 – ₹463",
    lotSize: 32,
    issueSize: "₹5,430 Cr",
    openDate: iso(addDays(today(), 7)),
    closeDate: iso(addDays(today(), 9)),
    allotmentDate: iso(addDays(today(), 12)),
    listingDate: iso(addDays(today(), 15)),
    status: "upcoming",
  },
  {
    id: "ipo-hyundai-motor",
    company: "Hyundai Motor India Ltd",
    sector: "Automotive / Passenger Vehicles",
    priceBand: "₹1,865 – ₹1,960",
    lotSize: 7,
    issueSize: "₹27,870 Cr",
    openDate: iso(addDays(today(), -4)),
    closeDate: iso(addDays(today(), -2)),
    allotmentDate: iso(addDays(today(), 1)),
    listingDate: iso(addDays(today(), 4)),
    status: "closed",
  },
  {
    id: "ipo-nsdl",
    company: "NSDL (National Securities Depository)",
    sector: "Financial Market Infrastructure",
    priceBand: "₹760 – ₹800",
    lotSize: 18,
    issueSize: "₹4,500 Cr",
    openDate: iso(addDays(today(), 14)),
    closeDate: iso(addDays(today(), 16)),
    allotmentDate: iso(addDays(today(), 19)),
    listingDate: iso(addDays(today(), 22)),
    status: "upcoming",
  },
  {
    id: "ipo-hexaware",
    company: "Hexaware Technologies Ltd",
    sector: "IT & Digital Services",
    priceBand: "₹674 – ₹708",
    lotSize: 21,
    issueSize: "₹8,750 Cr",
    openDate: iso(addDays(today(), 21)),
    closeDate: iso(addDays(today(), 23)),
    allotmentDate: iso(addDays(today(), 26)),
    listingDate: iso(addDays(today(), 29)),
    status: "upcoming",
  },
];

// Manually curated IPOs merged on top of the live NSE feed (feed can lag).
export const MANUAL_IPOS: IPO[] = IPOS;

/**
 * Status is always derived from the calendar, never trusted from the feed or a
 * hand-curated entry — so an issue rolls open → closed → allotted → listed on
 * its own as the dates pass, and drops out of "Current IPOs" the day it lists.
 */
export function resolveIpoStatus(ipo: Pick<IPO, "openDate" | "closeDate" | "allotmentDate" | "listingDate" | "status">): IPO["status"] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const day = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).getTime() : NaN);
  const now = t.getTime();
  const listing = day(ipo.listingDate);
  const allot = day(ipo.allotmentDate);
  const close = day(ipo.closeDate);
  const open = day(ipo.openDate);
  if (Number.isFinite(listing) && now >= listing) return "listed";
  if (Number.isFinite(allot) && now >= allot) return "allotted";
  if (Number.isFinite(close) && now > close) return "closed";
  if (Number.isFinite(open) && now >= open) return "open";
  if (Number.isFinite(open)) return "upcoming";
  return ipo.status;
}

export function ipoStatusLabel(s: IPO["status"]): string {
  switch (s) {
    case "upcoming": return "Upcoming";
    case "open": return "Subscription Open";
    case "closed": return "Closed";
    case "allotted": return "Allotment Done";
    case "listed": return "Listed";
  }
}
