/**
 * Options Pricing and Greeks Calculation Engine (Black-Scholes-Merton European Model).
 *
 * Implements standard institutional Black-Scholes pricing and Greeks for European index and stock options
 * traded on Indian exchanges (NSE / BSE).
 *
 * Market Conventions:
 * - Time to expiry (T): In years, calculated on a 365-day basis.
 * - Risk-free interest rate (r): Standard 6.8% (0.068), aligned with the Reserve Bank of India (RBI) Repo Rate & 91-day T-bill yields.
 * - Dividend yield (q): Default 1.2% (0.012) for NIFTY 50 dividend yield reference.
 * - Delta (Δ): Sensitivity of option price to a ₹1 change in underlying spot price.
 * - Gamma (Γ): Sensitivity of Delta to a ₹1 change in underlying spot price.
 * - Theta (Θ): Time decay per calendar day (expressed in ₹/day, negative for long options).
 * - Vega (ν): Sensitivity of option price to a 1 percentage point change in Implied Volatility (e.g., IV 15% -> 16%).
 * - Rho (ρ): Sensitivity of option price to a 1 percentage point change in interest rate.
 */

export interface GreeksInput {
  spot: number; // Underlying spot price (e.g. 24800)
  strike: number; // Option strike price (e.g. 24800)
  timeToExpiryYears: number; // Time to expiry in years (e.g. 3 / 365)
  volatility: number; // Implied Volatility as a decimal (e.g. 0.15 for 15%)
  riskFreeRate?: number; // Annual risk-free rate as a decimal (default 0.068)
  dividendYield?: number; // Annual dividend yield as a decimal (default 0.012)
  type: "CE" | "PE"; // Call or Put
}

export interface GreeksOutput {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // ₹ per calendar day
  vega: number; // ₹ per 1% change in IV
  rho: number; // ₹ per 1% change in rate
  intrinsicValue: number;
  timeValue: number;
  model: "Black-Scholes-Merton (European)";
  assumptions: {
    riskFreeRate: number;
    dividendYield: number;
    daysToExpiry: number;
  };
}

// Standard normal cumulative distribution function approximation (Abramowitz & Stegun, accurate to 1e-7)
export function normalCdf(x: number): number {
  if (isNaN(x)) return 0.5;
  if (x > 8) return 1;
  if (x < -8) return 0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal probability density function (PDF)
export function normalPdf(x: number): number {
  if (isNaN(x)) return 0;
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculate Black-Scholes Option Price and Greeks
 */
export function calculateGreeks(input: GreeksInput): GreeksOutput {
  const {
    spot,
    strike,
    type,
    riskFreeRate = 0.068,
    dividendYield = 0.012,
  } = input;

  const r = riskFreeRate;
  const q = dividendYield;
  const sigma = Math.max(0.001, input.volatility);
  // Near-zero time to expiry protection (expiry day / minutes before expiry)
  const T = Math.max(0.0001, input.timeToExpiryYears);
  const daysToExpiry = +(T * 365).toFixed(2);

  const intrinsicValue =
    type === "CE" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);

  // Near-expiry boundary condition (< 15 minutes to expiry)
  if (T <= 0.0002) {
    const isCall = type === "CE";
    const delta = isCall ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0);
    return {
      price: intrinsicValue,
      delta,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      intrinsicValue,
      timeValue: 0,
      model: "Black-Scholes-Merton (European)",
      assumptions: { riskFreeRate: r, dividendYield: q, daysToExpiry },
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const expNegQT = Math.exp(-q * T);
  const expNegRT = Math.exp(-r * T);

  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nPrimeD1 = normalPdf(d1);

  let price: number;
  let delta: number;
  let theta: number;
  let rho: number;

  if (type === "CE") {
    price = spot * expNegQT * nd1 - strike * expNegRT * nd2;
    delta = expNegQT * nd1;
    // Theta in ₹ per calendar day (/ 365)
    theta =
      (-(spot * expNegQT * nPrimeD1 * sigma) / (2 * sqrtT) -
        r * strike * expNegRT * nd2 +
        q * spot * expNegQT * nd1) /
      365;
    rho = (strike * T * expNegRT * nd2) / 100; // per 1% change
  } else {
    const nNegD1 = normalCdf(-d1);
    const nNegD2 = normalCdf(-d2);
    price = strike * expNegRT * nNegD2 - spot * expNegQT * nNegD1;
    delta = -expNegQT * nNegD1;
    theta =
      (-(spot * expNegQT * nPrimeD1 * sigma) / (2 * sqrtT) +
        r * strike * expNegRT * nNegD2 -
        q * spot * expNegQT * nNegD1) /
      365;
    rho = (-strike * T * expNegRT * nNegD2) / 100;
  }

  // Gamma is identical for Call and Put
  const gamma = (expNegQT * nPrimeD1) / (spot * sigma * sqrtT);
  // Vega: sensitivity to 1 percentage point change in IV (/ 100)
  const vega = (spot * expNegQT * nPrimeD1 * sqrtT) / 100;

  const safePrice = Math.max(intrinsicValue, Math.max(0, price));
  const timeValue = Math.max(0, safePrice - intrinsicValue);

  return {
    price: +safePrice.toFixed(2),
    delta: +delta.toFixed(4),
    gamma: +gamma.toFixed(5),
    theta: +theta.toFixed(2),
    vega: +vega.toFixed(2),
    rho: +rho.toFixed(4),
    intrinsicValue: +intrinsicValue.toFixed(2),
    timeValue: +timeValue.toFixed(2),
    model: "Black-Scholes-Merton (European)",
    assumptions: {
      riskFreeRate: r,
      dividendYield: q,
      daysToExpiry,
    },
  };
}

/**
 * Solve for Implied Volatility (IV) given market option price using Bisection + Newton-Raphson.
 * Returns IV as a percentage (e.g. 15.5 for 15.5%).
 */
export function calculateImpliedVolatility(
  marketPrice: number,
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  type: "CE" | "PE",
  riskFreeRate = 0.068,
  dividendYield = 0.012,
): number {
  const intrinsic = type === "CE" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (marketPrice <= intrinsic || timeToExpiryYears <= 0.0001) {
    return 0;
  }

  // Bracket for IV: 1% to 300%
  let low = 0.01;
  let high = 3.0;
  let sigma = 0.2; // initial guess 20%

  for (let i = 0; i < 35; i++) {
    const res = calculateGreeks({
      spot,
      strike,
      timeToExpiryYears,
      volatility: sigma,
      riskFreeRate,
      dividendYield,
      type,
    });

    const diff = res.price - marketPrice;
    if (Math.abs(diff) < 0.01) {
      return +(sigma * 100).toFixed(2);
    }

    // Vega is in per 1%, so convert to per decimal unit (* 100)
    const vegaUnit = res.vega * 100;
    if (vegaUnit > 0.001) {
      const step = diff / vegaUnit;
      const nextSigma = sigma - step;
      if (nextSigma > low && nextSigma < high) {
        sigma = nextSigma;
        continue;
      }
    }

    // Fall back to bisection if Newton step overshoots
    if (diff > 0) {
      high = sigma;
    } else {
      low = sigma;
    }
    sigma = (low + high) / 2;
  }

  return +(sigma * 100).toFixed(2);
}

/**
 * Calculate time to expiry in years from an ISO expiry date string (e.g. "2026-10-22")
 */
export function calculateTimeToExpiryYears(expiryDateStr: string, referenceDate = new Date()): number {
  try {
    // NSE derivatives expire at 15:30:00 IST on the expiry date
    const [year, month, day] = expiryDateStr.split("-").map(Number);
    if (!year || !month || !day) return 7 / 365;

    // Construct 15:30 IST (+05:30)
    const expiryDate = new Date(Date.UTC(year, month - 1, day, 10, 0, 0)); // 10:00 UTC = 15:30 IST
    const diffMs = expiryDate.getTime() - referenceDate.getTime();
    if (diffMs <= 0) {
      return 0.0001; // Minimum fraction for expiry day
    }
    return diffMs / (365 * 24 * 3600 * 1000);
  } catch {
    return 7 / 365;
  }
}
