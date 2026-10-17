import { STOCKS, generateSeries } from "./market-data";

export const DESKTOP_SYMBOLS = [
  "RELIANCE", "TCS", "INFY", "HDFCBANK", "ITC",
  "ICICIBANK", "SBIN", "BHARTIARTL", "TATAMOTORS", "ADANIENT",
];

export function chartData(symbol: string, points = 60) {
  const meta = STOCKS[symbol];
  const base = meta?.basePrice ?? 100;
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const series = generateSeries(seed, points, base, 0.015);
  const now = Date.now();
  return series.map((v, i) => ({
    t: new Date(now - (points - i) * 60_000).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    price: v,
  }));
}

export function computeRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const avgG = gains / period;
  const avgL = losses / period || 1e-9;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export const NEWS = [
  { time: "10:24 AM", stock: "RELIANCE", title: "Reliance Jio adds 3.2M subscribers in June, extends lead" },
  { time: "09:58 AM", stock: "TCS", title: "TCS wins $1.2B multi-year deal with European bank" },
  { time: "09:42 AM", stock: "TATAMOTORS", title: "Tata Motors reports strong EV sales, up 47% YoY" },
  { time: "09:15 AM", stock: "HDFCBANK", title: "HDFC Bank Q1 net profit rises 12%, beats estimates" },
  { time: "Yesterday", stock: "ADANIENT", title: "Adani Enterprises to invest ₹75,000 Cr in green hydrogen" },
];

export const ETF_RSI_MOCK = [
  { name: "NIFTYBEES", rsi: 24.6, price: 245.30, change: "-1.8%" },
  { name: "BANKBEES", rsi: 26.1, price: 512.10, change: "-2.3%" },
  { name: "ITBEES", rsi: 27.9, price: 41.05, change: "-1.2%" },
  { name: "PSUBNKBEES", rsi: 28.7, price: 78.40, change: "-2.9%" },
  { name: "GOLDBEES", rsi: 29.3, price: 62.55, change: "-0.6%" },
];

export const NOTIFICATIONS_LOG = [
  { ts: "2026-07-14 11:45", type: "RSI Alert", stock: "NIFTYBEES", content: "Oversold RSI 24.6", status: "Sent" },
  { ts: "2026-07-14 10:24", type: "News", stock: "RELIANCE", content: "Jio subscriber growth", status: "Sent" },
  { ts: "2026-07-13 11:45", type: "RSI Alert", stock: "BANKBEES", content: "Oversold RSI 25.4", status: "Sent" },
  { ts: "2026-07-13 09:15", type: "Quarterly", stock: "TCS", content: "Q1 results announced", status: "Sent" },
  { ts: "2026-07-12 11:45", type: "RSI Alert", stock: "PSUBNKBEES", content: "Oversold RSI 22.1", status: "Failed" },
];

export const USERS_MOCK = [
  { name: "Ananya Rao", regDate: "2026-05-12", lastLogin: "2026-07-14", holdings: 8, active: true },
  { name: "Rohan Mehta", regDate: "2026-04-30", lastLogin: "2026-07-14", holdings: 12, active: true },
  { name: "Priya Sharma", regDate: "2026-06-01", lastLogin: "2026-07-13", holdings: 3, active: true },
  { name: "Vikram Singh", regDate: "2026-03-18", lastLogin: "2026-07-10", holdings: 21, active: true },
  { name: "Neha Kapoor", regDate: "2026-02-05", lastLogin: "2026-06-28", holdings: 5, active: false },
];
