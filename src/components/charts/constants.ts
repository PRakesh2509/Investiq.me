export const INTERVALS: Array<{ id: string; label: string; interval: string; range: string }> = [
  { id: "1m", label: "1M", interval: "1m", range: "1d" },
  { id: "5m", label: "5M", interval: "5m", range: "1d" },
  { id: "15m", label: "15M", interval: "15m", range: "5d" },
  { id: "1h", label: "1H", interval: "60m", range: "1mo" },
  { id: "1d", label: "1D", interval: "1d", range: "3mo" },
  { id: "1w", label: "1W", interval: "1wk", range: "1y" },







];
export type Point = {
  t: string;
  price: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
  fullTime?: string;
  timestamp?: number;
};
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
