export interface StockMeta {
  symbol: string;
  name: string;
  sector: string;
  isin: string;
  basePrice: number;
  dayChangePct: number;
  marketCap: string;
  pe: number;
  eps: number;
  divYield: number;
  high52: number;
  low52: number;
  volume: string;
  about: string;
}

export const STOCKS: Record<string, StockMeta> = {
  RELIANCE: {
    symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy",
    isin: "INE002A01018", basePrice: 2954.6, dayChangePct: 1.24,
    marketCap: "₹19.9L Cr", pe: 27.3, eps: 108.2, divYield: 0.3,
    high52: 3217, low52: 2220, volume: "5.2M",
    about: "Reliance Industries is India's largest private-sector company, active across energy, petrochemicals, retail, and digital services (Jio).",
  },
  TCS: {
    symbol: "TCS", name: "Tata Consultancy Services", sector: "IT Services",
    isin: "INE467B01029", basePrice: 3891.2, dayChangePct: 0.62,
    marketCap: "₹14.1L Cr", pe: 30.1, eps: 129.5, divYield: 1.4,
    high52: 4254, low52: 3070, volume: "1.8M",
    about: "TCS is a global IT services and consulting leader and the flagship company of the Tata Group.",
  },
  INFY: {
    symbol: "INFY", name: "Infosys", sector: "IT Services",
    isin: "INE009A01021", basePrice: 1512.8, dayChangePct: -0.42,
    marketCap: "₹6.3L Cr", pe: 24.6, eps: 61.4, divYield: 2.4,
    high52: 1732, low52: 1216, volume: "6.4M",
    about: "Infosys provides consulting, technology, outsourcing, and next-generation digital services worldwide.",
  },
  HDFCBANK: {
    symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking",
    isin: "INE040A01034", basePrice: 1587.4, dayChangePct: -0.31,
    marketCap: "₹12.0L Cr", pe: 19.4, eps: 81.7, divYield: 1.2,
    high52: 1794, low52: 1363, volume: "8.1M",
    about: "HDFC Bank is India's largest private-sector bank by assets, offering retail and wholesale banking.",
  },
  TATAMOTORS: {
    symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto",
    isin: "INE155A01022", basePrice: 987.5, dayChangePct: 2.31,
    marketCap: "₹3.6L Cr", pe: 12.2, eps: 80.9, divYield: 0.6,
    high52: 1179, low52: 620, volume: "12.7M",
    about: "Tata Motors is a global automotive manufacturer with a strong presence in commercial vehicles and EVs, and owns Jaguar Land Rover.",
  },
  ICICIBANK: {
    symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking",
    isin: "INE090A01021", basePrice: 1189.9, dayChangePct: 0.87,
    marketCap: "₹8.3L Cr", pe: 17.8, eps: 66.8, divYield: 0.8,
    high52: 1257, low52: 970, volume: "7.4M",
    about: "ICICI Bank is a leading Indian private-sector bank offering retail, corporate, and treasury services.",
  },
  SBIN: {
    symbol: "SBIN", name: "State Bank of India", sector: "Banking",
    isin: "INE062A01020", basePrice: 812.4, dayChangePct: -1.02,
    marketCap: "₹7.2L Cr", pe: 10.2, eps: 79.6, divYield: 1.7,
    high52: 912, low52: 543, volume: "15.6M",
    about: "SBI is India's largest public-sector bank with the widest branch network in the country.",
  },
  BHARTIARTL: {
    symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom",
    isin: "INE397D01024", basePrice: 1478.2, dayChangePct: 0.94,
    marketCap: "₹8.8L Cr", pe: 76.4, eps: 19.3, divYield: 0.5,
    high52: 1615, low52: 900, volume: "3.2M",
    about: "Bharti Airtel is a global telecom services provider with operations across India, Africa, and South Asia.",
  },
  ITC: {
    symbol: "ITC", name: "ITC Limited", sector: "FMCG",
    isin: "INE154A01025", basePrice: 458.1, dayChangePct: 0.34,
    marketCap: "₹5.7L Cr", pe: 26.9, eps: 17.0, divYield: 2.9,
    high52: 499, low52: 399, volume: "9.8M",
    about: "ITC is a diversified conglomerate with businesses in FMCG, hotels, paperboards, packaging, and agri-business.",
  },
  ADANIENT: {
    symbol: "ADANIENT", name: "Adani Enterprises", sector: "Conglomerate",
    isin: "INE423A01024", basePrice: 2874.5, dayChangePct: 3.21,
    marketCap: "₹3.3L Cr", pe: 91.2, eps: 31.5, divYield: 0.1,
    high52: 3743, low52: 2025, volume: "2.1M",
    about: "Adani Enterprises is the flagship of the Adani Group, incubating businesses in energy, transport, and resources.",
  },
};

export const INDICES = [
  { symbol: "NIFTY 50", value: 24581.2, change: 118.4, pct: 0.48 },
  { symbol: "SENSEX", value: 80931.5, change: 402.7, pct: 0.50 },
  { symbol: "BANK NIFTY", value: 52104.3, change: -87.2, pct: -0.17 },
  { symbol: "NIFTY IT", value: 41209.6, change: 214.5, pct: 0.52 },
];

export function getStock(symbol: string): StockMeta | undefined {
  return STOCKS[symbol.toUpperCase()];
}

export function allSymbols(): string[] {
  return Object.keys(STOCKS);
}

// Deterministic pseudo-random price series for charts
export function generateSeries(seed: number, points = 40, base = 100, vol = 0.02) {
  let x = seed;
  const rnd = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  const out: number[] = [];
  let p = base;
  for (let i = 0; i < points; i++) {
    p = p * (1 + (rnd() - 0.5) * vol * 2);
    out.push(Number(p.toFixed(2)));
  }
  return out;
}

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}
