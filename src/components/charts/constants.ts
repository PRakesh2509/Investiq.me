export const INTERVALS: Array<{ id: string; label: string; interval: string; range: string }> = [
  { id: "1d", label: "1D", interval: "5m", range: "1d" },
  { id: "1w", label: "1W", interval: "30m", range: "5d" },
  { id: "1mo", label: "1M", interval: "1d", range: "1mo" },
  { id: "3mo", label: "3M", interval: "1d", range: "3mo" },
  { id: "6mo", label: "6M", interval: "1d", range: "6mo" },
  { id: "1y", label: "1Y", interval: "1wk", range: "1y" },
  { id: "5y", label: "5Y", interval: "1mo", range: "5y" },
  { id: "all", label: "ALL", interval: "1mo", range: "max" },
];
export type Point = { t: string; price: number; volume: number };
export type Tab = "overview" | "financials" | "news";

export const SECTOR_PALETTE = [
  "#E7A92A",
  "#9B8EC4",
  "#4B7BED",
  "#2DBF7F",
  "#FFD700",
  "#FF6B6B",
  "#38BDF8",
  "#A78BFA",
  "#F472B6",
  "#34D399",
  "#FB7185",
];
export const titleize = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const SECTOR_CATEGORIES: Record<string, string[]> = {
  "Top 10": [
    "RELIANCE",
    "TCS",
    "HDFCBANK",
    "INFY",
    "ICICIBANK",
    "SBIN",
    "BHARTIARTL",
    "ITC",
    "LTIM",
    "TATAMOTORS",
  ],
  "Banking & Fin": [
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "AXISBANK",
    "KOTAKBANK",
    "BAJFINANCE",
    "BAJAJFINSV",
    "PNB",
    "BANKBARODA",
  ],
  "IT Services": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "LTIM", "PERSISTENT", "MPHASIS"],
  Auto: ["TATAMOTORS", "MARUTI", "M&M", "BAJAJ-AUTO", "EICHERMOT", "TVSMOTOR", "HEROMOTOCO"],
  Energy: [
    "RELIANCE",
    "ONGC",
    "IOC",
    "BPCL",
    "HINDPETRO",
    "GAIL",
    "NTPC",
    "POWERGRID",
    "TATAPOWER",
  ],
  Pharma: ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "TORNTPHARM", "LUPIN", "APOLLOHOSP"],
  FMCG: ["ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "GODREJCP", "DABUR", "VBL", "TATACONSUM"],
  Metals: ["TATASTEEL", "JSWSTEEL", "HINDALCO", "COALINDIA", "VEDL"],
};
