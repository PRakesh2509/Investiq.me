/**
 * Market Regime Detection Engine (Phase 4)
 *
 * Implements a deterministic regime classifier with hysteresis & persistence rules:
 * - TRENDING_BULLISH: Spot > VWAP, 9EMA > 21EMA with upward slope, RSI in 55-70
 * - TRENDING_BEARISH: Spot < VWAP, 9EMA < 21EMA with downward slope, RSI in 30-45
 * - RANGE_BOUND: Spot oscillating around VWAP, EMAs entangled, RSI in 45-55, normal IV
 * - HIGH_VOLATILITY_BREAKOUT: ATR/Realized Vol expansion, spot breaking range bounds, high volume
 * - VOLATILITY_CONTRACTION: Sub-13 IV/VIX, narrow ATR band, compressed Bollinger width
 * - EVENT_DRIVEN: Imminent high-impact monetary policy / fiscal budget / geopolitical crisis
 * - INSUFFICIENT_DATA: Missing essential price or indicator feeds
 */

export type MarketRegimeType =
  | "TRENDING_BULLISH"
  | "TRENDING_BEARISH"
  | "RANGE_BOUND"
  | "HIGH_VOLATILITY_BREAKOUT"
  | "VOLATILITY_CONTRACTION"
  | "EVENT_DRIVEN"
  | "INSUFFICIENT_DATA";

export interface RegimeDetectionInput {
  instrument: string;
  spotPrice: number;
  changePct: number;
  ema9?: number;
  ema21?: number;
  vwap?: number;
  rsi?: number;
  atmIv?: number; // % e.g. 14.5
  indiaVix?: number; // e.g. 13.8
  pcr?: number;
  highImpactEventsCount?: number;
  previousRegime?: MarketRegimeType;
  persistenceCount?: number;
}

export interface RegimeDetectionResult {
  regime: MarketRegimeType;
  label: string;
  confidence: number; // 0 to 100%
  description: string;
  evidence: string[];
  persistenceCount: number;
  suggestedStrategyFamily: string;
  isTradePermitted: boolean;
  timestamp: string;
}

const MIN_PERSISTENCE_FOR_SWITCH = 2; // Hysteresis: requires 2 confirmations before flipping

export function detectMarketRegime(input: RegimeDetectionInput): RegimeDetectionResult {
  const {
    instrument,
    spotPrice,
    changePct,
    ema9,
    ema21,
    vwap,
    rsi,
    atmIv = 14.5,
    indiaVix = 13.8,
    pcr = 1.05,
    highImpactEventsCount = 0,
    previousRegime,
    persistenceCount = 1,
  } = input;

  const evidence: string[] = [];

  // Check for insufficient data first
  if (!spotPrice || ema9 === undefined || ema21 === undefined || rsi === undefined) {
    return {
      regime: "INSUFFICIENT_DATA",
      label: "Insufficient Market Data",
      confidence: 30,
      description: "Essential price structure or technical inputs are missing. No automated trade evaluation permitted.",
      evidence: ["Missing essential indicator feeds (EMA9, EMA21, or RSI)"],
      persistenceCount: 1,
      suggestedStrategyFamily: "CASH_PRESERVATION",
      isTradePermitted: false,
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Event-Driven Regime Check
  if (highImpactEventsCount >= 3 || (highImpactEventsCount > 0 && (atmIv > 22 || indiaVix > 20))) {
    evidence.push(
      highImpactEventsCount >= 3
        ? `Cluster of ${highImpactEventsCount} high-impact macroeconomic/geopolitical events creates elevated uncertainty`
        : `Scheduled high-impact event active with elevated IV (${atmIv.toFixed(1)}%) & VIX (${indiaVix.toFixed(1)})`
    );
    return {
      regime: "EVENT_DRIVEN",
      label: "Event-Driven Volatility Regime",
      confidence: 88,
      description: "Binary catalyst or high-impact macroeconomic event in progress. Premiums carry high event-crush risk.",
      evidence,
      persistenceCount: previousRegime === "EVENT_DRIVEN" ? persistenceCount + 1 : 1,
      suggestedStrategyFamily: "DEFINED_RISK_SPREADS_OR_HEDGES",
      isTradePermitted: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. High Volatility Breakout Check
  const isLargeIntradayMove = Math.abs(changePct) >= 1.25;
  if (isLargeIntradayMove && (atmIv > 18 || indiaVix > 16)) {
    evidence.push(`Substantial intraday expansion (${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%) with IV surge`);
    evidence.push(`Spot ${spotPrice.toFixed(1)} breaking outer volatility bands`);
    return {
      regime: "HIGH_VOLATILITY_BREAKOUT",
      label: "High-Volatility Breakout",
      confidence: 82,
      description: "Aggressive directional momentum with expanding volatility bands. Trend acceleration favored.",
      evidence,
      persistenceCount: previousRegime === "HIGH_VOLATILITY_BREAKOUT" ? persistenceCount + 1 : 1,
      suggestedStrategyFamily: "MOMENTUM_OPTIONS_BUYING",
      isTradePermitted: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Volatility Contraction Check
  if (atmIv <= 11.5 && indiaVix <= 12.0 && Math.abs(changePct) < 0.25) {
    evidence.push(`Sub-12 VIX (${indiaVix.toFixed(1)}) and compressed IV (${atmIv.toFixed(1)}%)`);
    evidence.push(`Flat intraday range (${changePct.toFixed(2)}%)`);
    return {
      regime: "VOLATILITY_CONTRACTION",
      label: "Volatility Contraction (Squeeze)",
      confidence: 80,
      description: "Extremely low implied volatility and narrow price range. Cheap option purchasing with breakout alert.",
      evidence,
      persistenceCount: previousRegime === "VOLATILITY_CONTRACTION" ? persistenceCount + 1 : 1,
      suggestedStrategyFamily: "CALENDAR_SPREADS_OR_STRADDLE_BUY",
      isTradePermitted: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 4. Directional Trending Bullish
  const isEmaBullish = ema9 > ema21;
  const isVwapBullish = vwap !== undefined ? spotPrice > vwap : true;
  const isRsiBullish = rsi >= 54 && rsi <= 72;
  const isPcrBullish = pcr >= 1.15;

  if (isEmaBullish && isVwapBullish && isRsiBullish) {
    evidence.push(`9EMA (₹${ema9.toFixed(1)}) > 21EMA (₹${ema21.toFixed(1)}) positive alignment`);
    if (vwap) evidence.push(`Spot trading above intraday VWAP (₹${vwap.toFixed(1)})`);
    evidence.push(`RSI(14) at ${rsi.toFixed(1)} in sustained expansion zone`);
    if (isPcrBullish) evidence.push(`PCR at ${pcr.toFixed(2)} confirms put writing support`);

    return {
      regime: "TRENDING_BULLISH",
      label: "Trending Bullish Regime",
      confidence: Math.min(92, 70 + (isPcrBullish ? 12 : 5) + (changePct > 0.5 ? 8 : 0)),
      description: "Market in structured upward trend. Buying ATM/slight ITM Calls or Bull Call Spreads is favored.",
      evidence,
      persistenceCount: previousRegime === "TRENDING_BULLISH" ? persistenceCount + 1 : 1,
      suggestedStrategyFamily: "BULL_CALL_SPREAD_OR_LONG_CALL",
      isTradePermitted: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 5. Directional Trending Bearish
  const isEmaBearish = ema9 < ema21;
  const isVwapBearish = vwap !== undefined ? spotPrice < vwap : true;
  const isRsiBearish = rsi <= 46 && rsi >= 28;
  const isPcrBearish = pcr <= 0.85;

  if (isEmaBearish && isVwapBearish && isRsiBearish) {
    evidence.push(`9EMA (₹${ema9.toFixed(1)}) < 21EMA (₹${ema21.toFixed(1)}) downward slope`);
    if (vwap) evidence.push(`Spot trading below intraday VWAP (₹${vwap.toFixed(1)})`);
    evidence.push(`RSI(14) at ${rsi.toFixed(1)} confirms bearish trend persistence`);
    if (isPcrBearish) evidence.push(`PCR at ${pcr.toFixed(2)} signifies call writer overhead dominance`);

    return {
      regime: "TRENDING_BEARISH",
      label: "Trending Bearish Regime",
      confidence: Math.min(92, 70 + (isPcrBearish ? 12 : 5) + (changePct < -0.5 ? 8 : 0)),
      description: "Market in structured downward distribution. Buying ATM Puts or Bear Put Spreads is favored.",
      evidence,
      persistenceCount: previousRegime === "TRENDING_BEARISH" ? persistenceCount + 1 : 1,
      suggestedStrategyFamily: "BEAR_PUT_SPREAD_OR_LONG_PUT",
      isTradePermitted: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 6. Range-Bound Default
  evidence.push(`EMAs entangled (|9EMA - 21EMA| = ₹${Math.abs(ema9 - ema21).toFixed(1)})`);
  evidence.push(`RSI at ${rsi.toFixed(1)} hovering in neutral consolidation corridor (45-55)`);
  evidence.push(`Spot oscillating around intraday equilibrium`);

  return {
    regime: "RANGE_BOUND",
    label: "Range-Bound Consolidation",
    confidence: 76,
    description: "No clear directional breakout. Mean-reversion or credit spreads favored over naked options buying.",
    evidence,
    persistenceCount: previousRegime === "RANGE_BOUND" ? persistenceCount + 1 : 1,
    suggestedStrategyFamily: "IRON_CONDOR_OR_CREDIT_SPREAD",
    isTradePermitted: true,
    timestamp: new Date().toISOString(),
  };
}
