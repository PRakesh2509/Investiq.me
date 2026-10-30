// Client-safe types for AI premium trades (implementation lives in ai-trades.server.ts).

export type PremiumTrade = {
  rank: number;
  grade: "A+" | "A" | "B";
  strategy: string;
  strike: number;
  optionType: "CE" | "PE";
  direction: "BUY" | "SELL";
  entry: number;
  target: number;
  stop: number;
  rr: number;
  confidence: number;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  rationale: string[];
  invalidation: string;
  // Sensibull Greeks View & Market Metrics
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
  oiResistance?: number;
  oiSupport?: number;
};

export type AiTradePlan = {
  symbol: string;
  expiry: string;
  spot: number;
  marketView: string;
  pcr: number;
  maxPain: number;
  trades: PremiumTrade[];
  caution: string;
  generatedAt: number;
  atmStrike?: number;
  atmIv?: number;
  peakGammaStrike?: number;
  maxThetaBurn?: number;
  oiResistanceWall?: number;
  oiSupportWall?: number;
};
