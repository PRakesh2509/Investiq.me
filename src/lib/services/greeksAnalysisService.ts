/**
 * Greeks Analysis Service (`greeksAnalysisService`)
 *
 * Implements Phase 3: In-depth Options Greeks analysis & strategy suitability.
 * Assesses:
 * - Delta directional skew and neutrality
 * - Gamma risk curve & explosive acceleration zones (ATM pin risk)
 * - Theta burn rate (₹/day per lot) and decay velocity
 * - Vega sensitivity and IV Smile / Skew asymmetry
 * - Greeks velocity between consecutive snapshots
 */

import type {
  SynchronizedGreeksSnapshot,
  GreeksVelocityPoint,
} from "./optionsGreeksDataService.ts";

export interface GreeksAnalysisReport {
  instrument: string;
  underlyingPrice: number;
  atmStrike: number;
  daysToExpiry: number;
  provider: string;
  /** Propagated from the Greeks snapshot: true when the surface is computed locally. */
  isSimulated: boolean;
  dataSource: string;
  /** Provider freshness verdict for the underlying Greeks surface, when reported. */
  freshnessStatus?: string;
  deltaAnalysis: {
    atmCallDelta: number;
    atmPutDelta: number;
    directionalBias: "BULLISH_DELTA_SKEW" | "BEARISH_DELTA_SKEW" | "NEUTRAL_BALANCED";
    deltaSpreadScore: number;
  };
  gammaAnalysis: {
    peakGamma: number;
    peakGammaStrike: number;
    isPeakAtAtm: boolean;
    gammaRiskLevel: "EXTREME_CONVEXITY" | "ELEVATED" | "MODERATE" | "LOW";
    atmPinningRisk: boolean;
  };
  thetaAnalysis: {
    atmDailyDecayPerShare: number; // ₹/day
    maxThetaBurnStrike: number;
    thetaBurnSeverity: "AGGRESSIVE_DECAY" | "MODERATE" | "BENIGN";
    recommendedAction: "FAVOR_SPREADS_OR_DEBIT_HEDGE" | "NAKED_LONG_TOLERABLE";
  };
  vegaAnalysis: {
    atmVega: number;
    ivSmileSkew: number | null; // Put IV - Call IV at 2% OTM; null when strikes are not available
    ivRegime: "VOLATILITY_ELEVATED" | "VOLATILITY_NORMAL" | "VOLATILITY_COMPRESSED";
  };
  summary: {
    atmCallDelta: number;
    atmPutDelta: number;
    peakGamma: number;
    peakGammaStrike: number;
    maxThetaBurn: number;
    maxThetaStrike: number;
    atmIv: number;
  };
  velocityAlerts: string[];
  strategySuitability: {
    longCallSuitability: "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE";
    longPutSuitability: "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE";
    spreadSuitability: "STRONGLY_FAVORED" | "ACCEPTABLE" | "SUBOPTIMAL";
    reasons: string[];
  };
  timestamp: string;
}

export class GreeksAnalysisService {
  /**
   * Analyze synchronized Greeks snapshot and extract actionable risk insights
   */
  public analyzeGreeks(snapshot: SynchronizedGreeksSnapshot): GreeksAnalysisReport {
    const { underlyingPrice, atmStrike, daysToExpiry, points, velocity, summary } = snapshot;
    if (!points || points.length === 0) {
      throw new Error("Greeks snapshot contains no strike points");
    }

    // 1. Delta Analysis
    const atmCallDelta = summary.atmCallDelta;
    const atmPutDelta = summary.atmPutDelta;
    const deltaDiff = atmCallDelta + atmPutDelta; // near 0 in balanced market
    let directionalBias: "BULLISH_DELTA_SKEW" | "BEARISH_DELTA_SKEW" | "NEUTRAL_BALANCED" =
      "NEUTRAL_BALANCED";
    if (deltaDiff > 0.08) directionalBias = "BULLISH_DELTA_SKEW";
    else if (deltaDiff < -0.08) directionalBias = "BEARISH_DELTA_SKEW";

    // 2. Gamma Analysis
    const peakGamma = summary.peakGamma;
    const peakGammaStrike = summary.peakGammaStrike;
    const isPeakAtAtm = Math.abs(peakGammaStrike - atmStrike) <= 50;

    let gammaRiskLevel: "EXTREME_CONVEXITY" | "ELEVATED" | "MODERATE" | "LOW" = "MODERATE";
    if (daysToExpiry <= 1.0 && peakGamma > 0.003) {
      gammaRiskLevel = "EXTREME_CONVEXITY";
    } else if (daysToExpiry <= 2.5 || peakGamma > 0.002) {
      gammaRiskLevel = "ELEVATED";
    } else if (daysToExpiry > 7) {
      gammaRiskLevel = "LOW";
    }

    // 3. Theta Analysis
    const atmPt = points.find((p) => p.isAtm) ?? points[Math.floor(points.length / 2)];
    const atmDailyDecayPerShare = Math.abs(atmPt.callTheta);
    const thetaBurnSeverity: "AGGRESSIVE_DECAY" | "MODERATE" | "BENIGN" =
      daysToExpiry <= 1.5 || atmDailyDecayPerShare > 25
        ? "AGGRESSIVE_DECAY"
        : daysToExpiry <= 4 || atmDailyDecayPerShare > 12
          ? "MODERATE"
          : "BENIGN";

    const recommendedAction =
      thetaBurnSeverity === "AGGRESSIVE_DECAY"
        ? "FAVOR_SPREADS_OR_DEBIT_HEDGE"
        : "NAKED_LONG_TOLERABLE";

    // 4. Vega & IV Skew
    const otmPut = points.find((p) => p.strike < underlyingPrice * 0.98);
    const otmCall = points.find((p) => p.strike > underlyingPrice * 1.02);
    const ivSmileSkew = otmPut && otmCall ? +(otmPut.putIv - otmCall.callIv).toFixed(2) : null;

    const atmIv = summary.atmIv;
    let ivRegime: "VOLATILITY_ELEVATED" | "VOLATILITY_NORMAL" | "VOLATILITY_COMPRESSED" =
      "VOLATILITY_NORMAL";
    if (atmIv > 20.0) ivRegime = "VOLATILITY_ELEVATED";
    else if (atmIv < 11.5) ivRegime = "VOLATILITY_COMPRESSED";

    // 5. Velocity Alerts
    const velocityAlerts: string[] = [];
    const hasVelocity = snapshot.velocityAvailable !== false;
    const maxDeltaShift = hasVelocity
      ? Math.max(...velocity.map((v) => Math.abs(v.deltaChange)), 0)
      : 0;
    if (maxDeltaShift > 0.05) {
      velocityAlerts.push(
        `Rapid Delta transition detected (Δ shift of ${maxDeltaShift.toFixed(3)}) across near-money strikes.`,
      );
    }
    const maxGammaShift = hasVelocity
      ? Math.max(...velocity.map((v) => Math.abs(v.gammaChange)), 0)
      : 0;
    if (maxGammaShift > 0.001) {
      velocityAlerts.push("Gamma risk acceleration building up rapidly near ATM.");
    }

    // 6. Strategy Suitability
    const reasons: string[] = [];
    let longCallSuitability: "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE" = "NEUTRAL";
    let longPutSuitability: "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE" = "NEUTRAL";
    let spreadSuitability: "STRONGLY_FAVORED" | "ACCEPTABLE" | "SUBOPTIMAL" = "ACCEPTABLE";

    if (thetaBurnSeverity === "AGGRESSIVE_DECAY") {
      spreadSuitability = "STRONGLY_FAVORED";
      reasons.push(
        "High Theta burn heavily penalizes naked long holding; vertical spreads mitigate decay.",
      );
      longCallSuitability = "UNFAVORABLE";
      longPutSuitability = "UNFAVORABLE";
    }

    if (ivRegime === "VOLATILITY_ELEVATED") {
      spreadSuitability = "STRONGLY_FAVORED";
      reasons.push("Elevated IV makes naked buying expensive; spreads provide Vega insulation.");
    } else if (ivRegime === "VOLATILITY_COMPRESSED") {
      reasons.push(
        "Low IV offers cheap directional optionality; long options face low volatility penalty.",
      );
    }

    if (directionalBias === "BULLISH_DELTA_SKEW") {
      longCallSuitability = thetaBurnSeverity === "AGGRESSIVE_DECAY" ? "NEUTRAL" : "FAVORABLE";
      reasons.push("Positive call delta skew indicates upward momentum accumulation.");
    } else if (directionalBias === "BEARISH_DELTA_SKEW") {
      longPutSuitability = thetaBurnSeverity === "AGGRESSIVE_DECAY" ? "NEUTRAL" : "FAVORABLE";
      reasons.push("Put delta dominance confirms downside hedging and institutional put buying.");
    }

    if (reasons.length === 0) {
      reasons.push(
        "Balanced Delta skew and standard IV indicate stable options market conditions.",
      );
    }

    return {
      instrument: snapshot.instrument,
      underlyingPrice,
      atmStrike,
      daysToExpiry,
      provider: snapshot.provider,
      isSimulated: snapshot.isSimulated,
      dataSource: snapshot.dataSource,
      freshnessStatus: snapshot.freshnessStatus,
      deltaAnalysis: {
        atmCallDelta,
        atmPutDelta,
        directionalBias,
        deltaSpreadScore: +deltaDiff.toFixed(3),
      },
      gammaAnalysis: {
        peakGamma,
        peakGammaStrike,
        isPeakAtAtm,
        gammaRiskLevel,
        atmPinningRisk: isPeakAtAtm && daysToExpiry <= 1.0,
      },
      thetaAnalysis: {
        atmDailyDecayPerShare,
        maxThetaBurnStrike: summary.maxThetaStrike,
        thetaBurnSeverity,
        recommendedAction,
      },
      vegaAnalysis: {
        atmVega: atmPt.callVega,
        ivSmileSkew,
        ivRegime,
      },
      summary,
      velocityAlerts,
      strategySuitability: {
        longCallSuitability,
        longPutSuitability,
        spreadSuitability,
        reasons,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const greeksAnalysisService = new GreeksAnalysisService();
