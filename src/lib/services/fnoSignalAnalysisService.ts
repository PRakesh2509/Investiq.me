/**
 * F&O Signal Analysis Service (`fnoSignalAnalysisService`)
 *
 * Implements Phase 3: Combined Technical + Options Positioning + Greeks Analysis.
 * Fuses:
 * 1. Price Action (Trend, VWAP, EMA 9/21, RSI 14, Supertrend, S/R from real candles)
 * 2. Options Positioning (OI Buildup, PCR, Max Pain, Concentration)
 * 3. Greeks Context (Delta, Gamma peak, Theta decay, Vega)
 * 4. Combined Confluence & Trap Detection (Gamma Pin, Divergences)
 *
 * Integrity rules:
 * - Technicals are computed ONLY from real candles. With too few candles the technical block
 *   is `available: false` (fields null) and the confluence score is capped to a neutral band,
 *   so no directional edge can be claimed from missing price data.
 */

import type { FnoMarketSnapshot } from "./fnoMarketDataService.ts";
import type { GreeksAnalysisReport } from "./greeksAnalysisService.ts";
import { ema, rsi, supertrend, vwap as vwapSeries } from "../indicators.ts";

export type MarketBias =
  "STRONG_BULLISH" | "MILD_BULLISH" | "NEUTRAL_RANGEBOUND" | "MILD_BEARISH" | "STRONG_BEARISH";

export type OiBuildupType =
  | "LONG_BUILDUP" // Price Up, OI Up
  | "SHORT_BUILDUP" // Price Down, OI Up
  | "SHORT_COVERING" // Price Up, OI Down
  | "LONG_UNWINDING" // Price Down, OI Down
  | "CONGESTION";

export interface TechnicalIndicatorsSnapshot {
  /** False when there were not enough real candles to compute indicators. */
  available: boolean;
  unavailableReason?: string;
  /** Epoch ms of the last real candle used (null when unavailable). */
  dataTimestamp: number | null;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  rsi14: number | null;
  rsiCondition: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT" | "UNAVAILABLE";
  ema9: number | null;
  ema21: number | null;
  emaCross: "BULLISH_STACK" | "BEARISH_STACK" | "UNAVAILABLE";
  /** Session VWAP; null when the feed carries no volume (e.g. cash indices). */
  vwap: number | null;
  priceVsVwap: "ABOVE_VWAP" | "BELOW_VWAP" | "AT_VWAP" | "UNAVAILABLE";
  supertrendBullish: boolean | null;
  pivotResistance: number | null;
  pivotSupport: number | null;
  volumeConfirmed: boolean | null;
}

export interface OptionsPositioningSnapshot {
  pcr: number;
  pcrInterpretation:
    "BULLISH_PUT_HEAVY" | "NEUTRAL_BALANCED" | "BEARISH_CALL_HEAVY" | "OVERSOLD_REVERSAL_ZONE";
  maxPainStrike: number;
  highestCallOiStrike: number; // Resistance wall
  highestPutOiStrike: number; // Support wall
  /** UNAVAILABLE when price direction cannot be determined (no real candles). */
  oiBuildup: OiBuildupType | "UNAVAILABLE";
  callOiChangeTotal: number;
  putOiChangeTotal: number;
  concentrationSummary: string;
}

export interface FnoAnalysisDataQuality {
  technical: "REAL" | "UNAVAILABLE";
  positioning: "REAL" | "SIMULATED";
  greeks: "REAL" | "SIMULATED";
  candleSource: string;
  candleLastBarAt: string | null;
  notes: string[];
}

export interface CombinedFnoAnalysisReport {
  instrument: string;
  underlyingPrice: number;
  marketBias: MarketBias;
  technical: TechnicalIndicatorsSnapshot;
  positioning: OptionsPositioningSnapshot;
  greeks: GreeksAnalysisReport;
  confluenceScore: number; // 0 to 100
  confluenceFactors: string[];
  divergenceWarnings: string[];
  primaryObservation: string;
  dataQuality: FnoAnalysisDataQuality;
  timestamp: string;
}

const MIN_TECHNICAL_BARS = 30;

function lastNumber(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

function unavailableTechnical(reason: string): TechnicalIndicatorsSnapshot {
  return {
    available: false,
    unavailableReason: reason,
    dataTimestamp: null,
    trend: "NEUTRAL",
    rsi14: null,
    rsiCondition: "UNAVAILABLE",
    ema9: null,
    ema21: null,
    emaCross: "UNAVAILABLE",
    vwap: null,
    priceVsVwap: "UNAVAILABLE",
    supertrendBullish: null,
    pivotResistance: null,
    pivotSupport: null,
    volumeConfirmed: null,
  };
}

/**
 * Compute technical indicators from REAL candles. Exported for reuse by the engine/tests.
 */
export function computeTechnicalSnapshot(
  bars: FnoMarketSnapshot["bars"],
  spot: number,
): TechnicalIndicatorsSnapshot {
  if (!Array.isArray(bars) || bars.length < MIN_TECHNICAL_BARS) {
    return unavailableTechnical(
      `Only ${bars?.length ?? 0} real candles available (need ${MIN_TECHNICAL_BARS})`,
    );
  }

  const closes = bars.map((b) => b.close);
  const ema9 = lastNumber(ema(closes, 9));
  const ema21 = lastNumber(ema(closes, 21));
  const rsi14 = lastNumber(rsi(closes, 14));
  if (ema9 === null || ema21 === null || rsi14 === null) {
    return unavailableTechnical("Indicator warm-up incomplete");
  }

  const vwap = lastNumber(vwapSeries(bars));
  const st = supertrend(bars, 10, 3);
  const stDir = st.direction[st.direction.length - 1];
  const supertrendBullish = stDir === null ? null : stDir === 1;

  // Votes from every available signal; trend only when they all agree.
  const votes: boolean[] = [ema9 > ema21, spot > ema21];
  if (vwap !== null) votes.push(spot > vwap);
  if (supertrendBullish !== null) votes.push(supertrendBullish);
  const trend = votes.every(Boolean) ? "BULLISH" : votes.every((v) => !v) ? "BEARISH" : "NEUTRAL";

  const window = bars.slice(-60);
  const pivotResistance = Math.round(Math.max(...window.map((b) => b.high)));
  const pivotSupport = Math.round(Math.min(...window.map((b) => b.low)));

  const totalVolume = bars.reduce((s, b) => s + b.volume, 0);
  let volumeConfirmed: boolean | null = null;
  if (totalVolume > 0) {
    const recent = bars.slice(-21, -1);
    const avg = recent.reduce((s, b) => s + b.volume, 0) / Math.max(1, recent.length);
    volumeConfirmed = bars[bars.length - 1].volume >= avg;
  }

  const round2 = (n: number) => +n.toFixed(2);
  return {
    available: true,
    dataTimestamp: bars[bars.length - 1].time * 1000,
    trend,
    rsi14: round2(rsi14),
    rsiCondition: rsi14 >= 70 ? "OVERBOUGHT" : rsi14 <= 30 ? "OVERSOLD" : "NEUTRAL",
    ema9: round2(ema9),
    ema21: round2(ema21),
    emaCross: ema9 >= ema21 ? "BULLISH_STACK" : "BEARISH_STACK",
    vwap: vwap === null ? null : round2(vwap),
    priceVsVwap:
      vwap === null
        ? "UNAVAILABLE"
        : Math.abs(spot - vwap) / vwap < 0.0002
          ? "AT_VWAP"
          : spot > vwap
            ? "ABOVE_VWAP"
            : "BELOW_VWAP",
    supertrendBullish,
    pivotResistance,
    pivotSupport,
    volumeConfirmed,
  };
}

export class FnoSignalAnalysisService {
  /**
   * Produce holistic combined market intelligence report
   */
  public analyzeCombinedSignal(
    marketSnapshot: FnoMarketSnapshot,
    greeksReport: GreeksAnalysisReport,
  ): CombinedFnoAnalysisReport {
    const { underlyingPrice, bars, rows, pcr, maxPainStrike } = marketSnapshot;

    // 1. Technical Analysis from REAL candles only
    const technical = computeTechnicalSnapshot(bars, underlyingPrice);

    // 2. Options Positioning
    let highestCallOi = 0;
    let highestCallStrike = maxPainStrike;
    let highestPutOi = 0;
    let highestPutStrike = maxPainStrike;
    let callOiChangeTotal = 0;
    let putOiChangeTotal = 0;

    for (const r of rows) {
      if (r.call.openInterest > highestCallOi) {
        highestCallOi = r.call.openInterest;
        highestCallStrike = r.strike;
      }
      if (r.put.openInterest > highestPutOi) {
        highestPutOi = r.put.openInterest;
        highestPutStrike = r.strike;
      }
      callOiChangeTotal += r.call.oiChange;
      putOiChangeTotal += r.put.oiChange;
    }

    let pcrInterpretation: OptionsPositioningSnapshot["pcrInterpretation"] = "NEUTRAL_BALANCED";
    if (pcr >= 1.25) pcrInterpretation = "BULLISH_PUT_HEAVY";
    else if (pcr <= 0.65) pcrInterpretation = "OVERSOLD_REVERSAL_ZONE";
    else if (pcr < 0.85) pcrInterpretation = "BEARISH_CALL_HEAVY";

    const lastBar = bars[bars.length - 1];
    const prevBar = bars[bars.length - 2];
    const hasPriceDirection = technical.available && lastBar !== undefined && prevBar !== undefined;
    const priceUp = hasPriceDirection ? lastBar.close >= prevBar.close : null;
    const totalOiUp = callOiChangeTotal + putOiChangeTotal > 0;
    let oiBuildup: OptionsPositioningSnapshot["oiBuildup"] = "UNAVAILABLE";
    if (priceUp !== null) {
      if (priceUp && totalOiUp) oiBuildup = "LONG_BUILDUP";
      else if (!priceUp && totalOiUp) oiBuildup = "SHORT_BUILDUP";
      else if (priceUp && !totalOiUp) oiBuildup = "SHORT_COVERING";
      else oiBuildup = "LONG_UNWINDING";
    }

    const positioning: OptionsPositioningSnapshot = {
      pcr,
      pcrInterpretation,
      maxPainStrike,
      highestCallOiStrike: highestCallStrike,
      highestPutOiStrike: highestPutStrike,
      oiBuildup,
      callOiChangeTotal,
      putOiChangeTotal,
      concentrationSummary: `Major Call resistance wall at ${highestCallStrike}; Put support base at ${highestPutStrike}`,
    };

    // 3. Combined Interpretation & Confluence Score
    const confluenceFactors: string[] = [];
    const divergenceWarnings: string[] = [];
    let confluenceScore = 50;

    if (technical.trend === "BULLISH") {
      confluenceScore += 15;
      confluenceFactors.push(
        "Price trending above its EMA/VWAP/Supertrend structure (bullish stack).",
      );
    } else if (technical.trend === "BEARISH") {
      confluenceScore -= 15;
      confluenceFactors.push("Price below its EMA/VWAP/Supertrend structure (bearish alignment).");
    }

    if (positioning.pcrInterpretation === "BULLISH_PUT_HEAVY") {
      confluenceScore += 12;
      confluenceFactors.push(
        `High Put-Call Ratio (${pcr.toFixed(2)}) indicates robust downside support base.`,
      );
    } else if (positioning.pcrInterpretation === "BEARISH_CALL_HEAVY") {
      confluenceScore -= 12;
      confluenceFactors.push(
        `Low PCR (${pcr.toFixed(2)}) demonstrates strong Call writing overhead.`,
      );
    }

    if (greeksReport.deltaAnalysis.directionalBias === "BULLISH_DELTA_SKEW") {
      confluenceScore += 10;
      confluenceFactors.push("Greeks delta skew confirms upward institutional position loading.");
    } else if (greeksReport.deltaAnalysis.directionalBias === "BEARISH_DELTA_SKEW") {
      confluenceScore -= 10;
      confluenceFactors.push("Greeks delta skew confirms protective put buying pressure.");
    }

    // Divergence / Trap Checks
    if (priceUp === true && positioning.oiBuildup === "SHORT_COVERING") {
      divergenceWarnings.push(
        "Price increase driven predominantly by short covering rather than fresh accumulation.",
      );
    }
    if (greeksReport.gammaAnalysis.gammaRiskLevel === "EXTREME_CONVEXITY") {
      divergenceWarnings.push(
        "Extreme ATM Gamma convexity: Near-expiry pinning or rapid delta swings can trigger whip-saws.",
      );
    }
    if (greeksReport.thetaAnalysis.thetaBurnSeverity === "AGGRESSIVE_DECAY") {
      divergenceWarnings.push(
        "Aggressive intraday Theta burn: naked option holding carries substantial decay penalty.",
      );
    }

    confluenceScore = Math.max(10, Math.min(95, confluenceScore));

    // Missing price data => no directional edge may be claimed: keep the score neutral.
    if (!technical.available) {
      confluenceScore = Math.max(41, Math.min(59, confluenceScore));
      divergenceWarnings.push(
        `Technical indicators unavailable (${technical.unavailableReason}); confluence capped to neutral band.`,
      );
    }

    let marketBias: MarketBias = "NEUTRAL_RANGEBOUND";
    if (confluenceScore >= 75) marketBias = "STRONG_BULLISH";
    else if (confluenceScore >= 60) marketBias = "MILD_BULLISH";
    else if (confluenceScore <= 25) marketBias = "STRONG_BEARISH";
    else if (confluenceScore <= 40) marketBias = "MILD_BEARISH";

    const buildupText = positioning.oiBuildup.replace("_", " ").toLowerCase();
    const primaryObservation = marketBias.includes("BULLISH")
      ? `Upward momentum supported by ${buildupText} and solid put support at ${highestPutStrike}.`
      : marketBias.includes("BEARISH")
        ? `Downward pressure with call resistance wall at ${highestCallStrike} and ${buildupText}.`
        : `Balanced rangebound consolidation between ${highestPutStrike} (Support) and ${highestCallStrike} (Resistance).`;

    const notes: string[] = [];
    if (!technical.available) notes.push(`Technicals unavailable: ${technical.unavailableReason}`);
    if (marketSnapshot.isSimulated) {
      notes.push("Option chain (OI, PCR, bid/ask) is a simulated baseline, not a broker feed.");
    }
    if (greeksReport.isSimulated) {
      notes.push("Greeks surface is computed locally (Black-Scholes), not a live feed.");
    }

    return {
      instrument: marketSnapshot.instrument,
      underlyingPrice,
      marketBias,
      technical,
      positioning,
      greeks: greeksReport,
      confluenceScore,
      confluenceFactors,
      divergenceWarnings,
      primaryObservation,
      dataQuality: {
        technical: technical.available ? "REAL" : "UNAVAILABLE",
        positioning: marketSnapshot.isSimulated ? "SIMULATED" : "REAL",
        greeks: greeksReport.isSimulated ? "SIMULATED" : "REAL",
        candleSource: marketSnapshot.barsSource,
        candleLastBarAt: marketSnapshot.barsLastAt,
        notes,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const fnoSignalAnalysisService = new FnoSignalAnalysisService();
