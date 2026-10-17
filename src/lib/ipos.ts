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
    openDate: iso(addDays(today(), 3)),
    closeDate: iso(addDays(today(), 5)),
    allotmentDate: iso(addDays(today(), 8)),
    listingDate: iso(addDays(today(), 11)),
    status: "upcoming",
  },
  {
    id: "ipo-ola-electric",
    company: "Ola Electric Mobility",
    sector: "EV / Auto",
    priceBand: "₹72 – ₹76",
    lotSize: 195,
    issueSize: "₹6,145 Cr",
    openDate: iso(addDays(today(), -2)),
    closeDate: iso(addDays(today(), 1)),
    allotmentDate: iso(addDays(today(), 4)),
    listingDate: iso(addDays(today(), 7)),
    status: "open",
  },
  {
    id: "ipo-bajaj-housing",
    company: "Bajaj Housing Finance",
    sector: "Financials",
    priceBand: "₹66 – ₹70",
    lotSize: 214,
    issueSize: "₹6,560 Cr",
    openDate: iso(addDays(today(), -12)),
    closeDate: iso(addDays(today(), -10)),
    allotmentDate: iso(addDays(today(), -7)),
    listingDate: iso(addDays(today(), -4)),
    status: "listed",
  },
  {
    id: "ipo-nsdl",
    company: "NSDL",
    sector: "Financial Infrastructure",
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
    company: "Hexaware Technologies",
    sector: "IT Services",
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
export const MANUAL_IPOS: IPO[] = [
  {
    id: "manual-dhoot-transmission",
    company: "Dhoot Transmission Ltd",
    sector: "Auto Components",
    priceBand: "₹—",
    lotSize: 0,
    issueSize: "—",
    openDate: "2026-08-10",
    closeDate: "2026-08-12",
    allotmentDate: "2026-08-14",
    listingDate: "2026-08-18",
    status: "open",
  },
  {
    id: "manual-molbio-diagnostics",
    company: "Molbio Diagnostics Ltd",
    sector: "Healthcare / Diagnostics",
    priceBand: "₹—",
    lotSize: 0,
    issueSize: "—",
    openDate: "2026-08-10",
    closeDate: "2026-08-12",
    allotmentDate: "2026-08-14",
    listingDate: "2026-08-18",
    status: "open",
  },
];

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
