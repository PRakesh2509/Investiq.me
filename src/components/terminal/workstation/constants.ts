export const TIMEFRAMES = ["1M", "3M", "5M", "15M", "30M", "1H", "1D"] as const;
export type TF = (typeof TIMEFRAMES)[number];

export const TF_SECONDS: Record<TF, number> = {
  "1M": 60,
  "3M": 180,
  "5M": 300,
  "15M": 900,
  "30M": 1800,
  "1H": 3600,
  "1D": 86400,
};

export const NSE_TABS = ["NIFTY 50", "BANK NIFTY", "FIN NIFTY", "SENSEX", "MIDCAP NIFTY"] as const;
export const GLOBAL_TABS = ["S&P 500", "NASDAQ 100", "DOW JONES"] as const;

/** Server quote/intelligence refresh cadence. */
export const REFRESH_INTERVAL_MS = 15_000;
