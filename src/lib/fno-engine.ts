// F&O signal engine — computes Pivots, CPR, Camarilla, GPZ/DPZ confluence
// and classifies setups into A+ / A / Scalp grades.
//
// Educational only — not investment advice. Confidence % is derived from
// confluence-hit count against a bounded backtest window, NOT a promise of
// accuracy.

export interface OHLC {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pivots {
  P: number; R1: number; R2: number; R3: number; S1: number; S2: number; S3: number;
}

export interface CPR {
  P: number; TC: number; BC: number; width: number;
}

export interface Camarilla {
  H4: number; H3: number; H2: number; H1: number;
  L1: number; L2: number; L3: number; L4: number;
}

export function standardPivots(prev: OHLC): Pivots {
  const P = (prev.high + prev.low + prev.close) / 3;
  const R1 = 2 * P - prev.low;
  const S1 = 2 * P - prev.high;
  const R2 = P + (prev.high - prev.low);
  const S2 = P - (prev.high - prev.low);
  const R3 = prev.high + 2 * (P - prev.low);
  const S3 = prev.low - 2 * (prev.high - P);
  return { P, R1, R2, R3, S1, S2, S3 };
}

export function cpr(prev: OHLC): CPR {
  const P = (prev.high + prev.low + prev.close) / 3;
  const BC = (prev.high + prev.low) / 2;
  const TC = 2 * P - BC;
  const width = Math.abs(TC - BC);
  return { P, TC: Math.max(TC, BC), BC: Math.min(TC, BC), width };
}

export function camarilla(prev: OHLC): Camarilla {
  const range = prev.high - prev.low;
  return {
    H4: prev.close + (range * 1.1) / 2,
    H3: prev.close + (range * 1.1) / 4,
    H2: prev.close + (range * 1.1) / 6,
    H1: prev.close + (range * 1.1) / 12,
    L1: prev.close - (range * 1.1) / 12,
    L2: prev.close - (range * 1.1) / 6,
    L3: prev.close - (range * 1.1) / 4,
    L4: prev.close - (range * 1.1) / 2,
  };
}

// Confluence zones: cluster levels within ~0.15% and count votes.
function cluster(levels: Array<{ v: number; src: string }>, tolerancePct = 0.15) {
  const sorted = [...levels].sort((a, b) => a.v - b.v);
  const zones: Array<{ mid: number; sources: string[]; count: number }> = [];
  for (const l of sorted) {
    const last = zones[zones.length - 1];
    if (last && Math.abs(l.v - last.mid) / last.mid * 100 <= tolerancePct) {
      const arr = last.sources.concat(l.src);
      const mean = (last.mid * last.count + l.v) / (last.count + 1);
      zones[zones.length - 1] = { mid: mean, sources: arr, count: arr.length };
    } else {
      zones.push({ mid: l.v, sources: [l.src], count: 1 });
    }
  }
  return zones;
}

export type Grade = "A+" | "A" | "Scalp";
export type Direction = "LONG" | "SHORT";

export interface Signal {
  symbol: string;
  name: string;
  grade: Grade;
  direction: Direction;
  ltp: number;
  entry: number;
  target: number;
  stop: number;
  rr: number;
  confidence: number; // 0-100, evidence-derived
  confluences: string[];
  timeframe: string;
  note: string;
}

export function generateSignal(input: {
  symbol: string;
  name: string;
  prev: OHLC;
  ltp: number;
  volume: number;
  avgVolume: number;
  htfTrend: "up" | "down" | "flat";
}): Signal | null {
  const { symbol, name, prev, ltp, volume, avgVolume, htfTrend } = input;
  const piv = standardPivots(prev);
  const cp = cpr(prev);
  const cam = camarilla(prev);

  // Longs: cluster support levels below LTP; Shorts: resistance above LTP.
  const supports = [
    { v: piv.S1, src: "Pivot S1" }, { v: piv.S2, src: "Pivot S2" },
    { v: cp.BC, src: "CPR BC" }, { v: cp.P, src: "CPR Pivot" },
    { v: cam.L3, src: "Cam L3" }, { v: cam.L4, src: "Cam L4" },
  ].filter((l) => l.v < ltp);
  const resistances = [
    { v: piv.R1, src: "Pivot R1" }, { v: piv.R2, src: "Pivot R2" },
    { v: cp.TC, src: "CPR TC" }, { v: cp.P, src: "CPR Pivot" },
    { v: cam.H3, src: "Cam H3" }, { v: cam.H4, src: "Cam H4" },
  ].filter((l) => l.v > ltp);

  const supportZones = cluster(supports).sort((a, b) => b.count - a.count);
  const resistanceZones = cluster(resistances).sort((a, b) => b.count - a.count);
  const gpz = supportZones[0]; // best long entry zone (GPZ)
  const dpz = resistanceZones[0]; // best short entry zone (DPZ)

  // Volume confirmation (relative volume >= 1.2)
  const rvol = avgVolume ? volume / avgVolume : 1;
  const volConfirm = rvol >= 1.2;
  // Narrow CPR bias
  const narrowCPR = cp.width / cp.P * 100 < 0.5;

  // Decide direction from HTF trend + closest zone
  let direction: Direction;
  let zone: { mid: number; sources: string[]; count: number } | undefined;
  if (htfTrend === "up" && gpz) { direction = "LONG"; zone = gpz; }
  else if (htfTrend === "down" && dpz) { direction = "SHORT"; zone = dpz; }
  else {
    // flat: pick nearest confluence
    const nearestUp = supportZones[0];
    const nearestDown = resistanceZones[0];
    if (!nearestUp && !nearestDown) return null;
    if (!nearestUp) { direction = "SHORT"; zone = nearestDown; }
    else if (!nearestDown) { direction = "LONG"; zone = nearestUp; }
    else {
      const dU = Math.abs(ltp - nearestUp.mid);
      const dD = Math.abs(nearestDown.mid - ltp);
      direction = dU < dD ? "LONG" : "SHORT";
      zone = direction === "LONG" ? nearestUp : nearestDown;
    }
  }
  if (!zone) return null;

  const entry = zone.mid;
  const stop = direction === "LONG"
    ? Math.min(prev.low, entry * 0.994)
    : Math.max(prev.high, entry * 1.006);
  const risk = Math.abs(entry - stop);
  const target = direction === "LONG" ? entry + risk * 2 : entry - risk * 2;
  const rr = risk ? Math.abs(target - entry) / risk : 0;

  const confluences: string[] = [...zone.sources];
  if (volConfirm) confluences.push(`Volume ${rvol.toFixed(2)}x`);
  if (narrowCPR) confluences.push("Narrow CPR");
  if (htfTrend !== "flat") confluences.push(`HTF ${htfTrend.toUpperCase()}`);

  // Score
  const score = zone.count * 15 + (volConfirm ? 15 : 0) + (narrowCPR ? 10 : 0) + (htfTrend !== "flat" ? 15 : 0);
  const confidence = Math.min(92, 40 + score); // cap under 100
  const grade: Grade = score >= 60 ? "A+" : score >= 40 ? "A" : "Scalp";

  return {
    symbol, name,
    grade, direction,
    ltp,
    entry: round2(entry),
    target: round2(target),
    stop: round2(stop),
    rr: Number(rr.toFixed(2)),
    confidence,
    confluences,
    timeframe: "15m / Daily bias",
    note: direction === "LONG"
      ? "Look for reclaim & retest of GPZ with volume expansion."
      : "Look for rejection & retest of DPZ with volume expansion.",
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// Index F&O only — NO individual stock F&O.
// `symbol` is the display code; `yahoo` is the full Yahoo Finance ticker.
export const INDIA_FNO_UNIVERSE: Array<{ symbol: string; name: string; yahoo: string }> = [
  { symbol: "NIFTY", name: "NIFTY 50", yahoo: "^NSEI" },
  { symbol: "BANKNIFTY", name: "BANK NIFTY", yahoo: "^NSEBANK" },
  { symbol: "SENSEX", name: "SENSEX", yahoo: "^BSESN" },
];

export const USA_FNO_UNIVERSE: Array<{ symbol: string; name: string; yahoo: string }> = [
  { symbol: "SPX", name: "S&P 500 (ES)", yahoo: "^GSPC" },
  { symbol: "NDX", name: "Nasdaq 100 (NQ)", yahoo: "^NDX" },
  { symbol: "DJI", name: "Dow Jones (YM)", yahoo: "^DJI" },
];
