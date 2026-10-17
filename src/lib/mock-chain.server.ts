/**
 * Synthetic option-chain + trade-plan generator for TEST alerts only.
 *
 * Used when Upstox credentials are missing/expired so test Telegram alerts can
 * still be exercised end-to-end. Values are randomised and NOT market data.
 */

import type { OptionChain, OptionRow, OptionSide } from "./upstox.server";
import type { AiTradePlan, PremiumTrade } from "./ai-trades";

const BASE: Record<string, { spot: number; step: number }> = {
  NIFTY: { spot: 24800, step: 50 },
  NIFTY50: { spot: 24800, step: 50 },
  BANKNIFTY: { spot: 55200, step: 100 },
  SENSEX: { spot: 81200, step: 100 },
};

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const r2 = (n: number) => Math.round(n * 100) / 100;

function nextThursdayISO() {
  const d = new Date();
  const add = (4 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function side(premium: number, oi: number, delta: number): OptionSide {
  const ltp = r2(Math.max(1, premium));
  return {
    instrumentKey: "MOCK",
    ltp,
    close: r2(ltp * rnd(0.92, 1.08)),
    volume: Math.round(rnd(5e4, 9e5)),
    oi,
    prevOi: Math.round(oi * rnd(0.8, 1.15)),
    oiChange: Math.round(oi * rnd(-0.2, 0.25)),
    bid: r2(ltp * 0.995),
    bidQty: Math.round(rnd(50, 2000)),
    ask: r2(ltp * 1.005),
    askQty: Math.round(rnd(50, 2000)),
    iv: r2(rnd(11, 22)),
    delta: r2(delta),
    gamma: r2(rnd(0.0001, 0.002)),
    theta: r2(-rnd(2, 18)),
    vega: r2(rnd(2, 12)),
  };
}

/** Build a randomised chain around a plausible spot for the given index. */
export function buildMockChain(symbol: string): OptionChain {
  const cfg = BASE[symbol.toUpperCase()] ?? BASE.NIFTY;
  const spot = r2(cfg.spot * rnd(0.99, 1.01));
  const atm = Math.round(spot / cfg.step) * cfg.step;
  const rows: OptionRow[] = [];
  let totalCallOi = 0;
  let totalPutOi = 0;

  for (let i = -10; i <= 10; i++) {
    const strike = atm + i * cfg.step;
    const dist = Math.abs(strike - spot);
    const decay = Math.exp(-dist / (cfg.step * 6));
    const cOi = Math.round(rnd(2e5, 1.4e6) * decay + 2e4);
    const pOi = Math.round(rnd(2e5, 1.4e6) * decay + 2e4);
    totalCallOi += cOi;
    totalPutOi += pOi;
    const cPrem = Math.max(spot - strike, 0) + cfg.step * decay * rnd(1, 2.4);
    const pPrem = Math.max(strike - spot, 0) + cfg.step * decay * rnd(1, 2.4);
    rows.push({
      strike,
      call: side(cPrem, cOi, strike < spot ? rnd(0.55, 0.9) : rnd(0.1, 0.45)),
      put: side(pPrem, pOi, strike > spot ? -rnd(0.55, 0.9) : -rnd(0.1, 0.45)),
    });
  }

  const maxPain = rows.reduce(
    (best, r) => (r.call.oi + r.put.oi > best.oi ? { oi: r.call.oi + r.put.oi, strike: r.strike } : best),
    { oi: 0, strike: atm },
  ).strike;

  return {
    underlyingKey: `MOCK|${symbol.toUpperCase()}`,
    expiry: nextThursdayISO(),
    spot,
    atmStrike: atm,
    pcr: r2(totalPutOi / Math.max(1, totalCallOi)),
    maxPain,
    totalCallOi,
    totalPutOi,
    rows,
    generatedAt: Date.now(),
  };
}

/** Deterministic-shape sample trades derived from a (mock) chain. */
export function buildMockPlan(symbol: string, chain: OptionChain): AiTradePlan {
  const step = chain.rows.length > 1 ? chain.rows[1].strike - chain.rows[0].strike : 50;
  const bullish = chain.pcr >= 1;
  const mk = (rank: number, otm: number, type: "CE" | "PE"): PremiumTrade => {
    const strike = chain.atmStrike + (type === "CE" ? otm : -otm) * step;
    const row = chain.rows.find((r) => r.strike === strike) ?? chain.rows[10];
    const entry = r2((type === "CE" ? row.call.ltp : row.put.ltp) || rnd(60, 180));
    const stop = r2(entry * 0.75);
    const target = r2(entry * 1.6);
    return {
      rank,
      grade: rank === 1 ? "A+" : "A",
      strategy: `${type === "CE" ? "Bullish" : "Bearish"} directional option buy`,
      strike,
      optionType: type,
      direction: "BUY",
      entry,
      target,
      stop,
      rr: r2((target - entry) / (entry - stop)),
      confidence: Math.round(rnd(62, 84)),
      bias: type === "CE" ? "BULLISH" : "BEARISH",
      rationale: [
        `PCR at ${chain.pcr} favours ${type === "CE" ? "call" : "put"} writers unwinding`,
        `Max pain at ${chain.maxPain} sits ${type === "CE" ? "below" : "above"} spot`,
        `IV ${type === "CE" ? row.call.iv : row.put.iv}% keeps premium decay manageable`,
      ],
      invalidation: `Exit if premium closes below ₹${stop} on a 15m candle.`,
    };
  };

  return {
    symbol: symbol.toUpperCase(),
    expiry: chain.expiry,
    spot: chain.spot,
    pcr: chain.pcr,
    maxPain: chain.maxPain,
    marketView: `Sample test snapshot: PCR ${chain.pcr} with max pain at ${chain.maxPain} implies a ${bullish ? "mildly bullish" : "mildly bearish"} tilt around ${chain.atmStrike}.`,
    caution: "TEST DATA — simulated values, educational only, not investment advice.",
    trades: bullish
      ? [mk(1, 1, "CE"), mk(2, 3, "CE"), mk(3, 2, "PE")]
      : [mk(1, 1, "PE"), mk(2, 3, "PE"), mk(3, 2, "CE")],
    generatedAt: Date.now(),
  };
}
