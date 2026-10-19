export interface AppliedIpoRecord {
  ipoId: string;
  company: string;
  symbol: string;
  category: "MAINBOARD" | "SME";
  price: number;
  lotSize: number;
  lotsApplied: number;
  totalInvestment: number;
  estimatedProfit?: number;
  appliedDate: string; // ISO
  allotmentDate: string;
  listingDate: string;
  status: "applied" | "allotted" | "not_allotted";
  registrar: string;
  allotmentUrl: string;
  gmp: number | null;
}

const STORAGE_KEY = "investiq_applied_ipos_v1";

export function getAppliedIpos(): AppliedIpoRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAppliedIpo(record: AppliedIpoRecord): AppliedIpoRecord[] {
  const current = getAppliedIpos().filter((r) => r.ipoId !== record.ipoId);
  const updated = [record, ...current];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function removeAppliedIpo(ipoId: string): AppliedIpoRecord[] {
  const updated = getAppliedIpos().filter((r) => r.ipoId !== ipoId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function updateAppliedIpoStatus(
  ipoId: string,
  status: AppliedIpoRecord["status"],
): AppliedIpoRecord[] {
  const list = getAppliedIpos().map((r) => (r.ipoId === ipoId ? { ...r, status } : r));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  return list;
}
