import { adminPost } from "../adminFetch";
export type Side = {
  ltp: number;
  close: number;
  volume: number;
  oi: number;
  prevOi: number;
  oiChange: number;
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};
export type Row = { strike: number; call: Side; put: Side };
export type Chain = {
  underlyingKey: string;
  expiry: string;
  spot: number;
  atmStrike: number;
  pcr: number;
  maxPain: number;
  totalCallOi: number;
  totalPutOi: number;
  rows: Row[];
  generatedAt: number;
  /** Optional data-quality flags set by the server. Read defensively. */
  isSimulated?: boolean;
  dataSource?: string;
  freshnessStatus?: string;
};
export type Underlying = { key: string; label: string; segment: "INDEX" | "EQ" };
export type View = "both" | "CE" | "PE";

export const REFRESH_MS = 2000;

export const n2 = (v: number, d = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";
export const compact = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
};

type AlertPayload = Record<string, unknown>;
export async function notifyTelegram(
  payload: AlertPayload,
): Promise<{ ok: boolean; error?: string }> {
  const r = await adminPost("/api/option-alert", payload);
  return { ok: r.ok, error: r.error };
}
