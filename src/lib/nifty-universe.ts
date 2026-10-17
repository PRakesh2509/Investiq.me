// Nifty 100 universe with sector tags. All symbols use the Yahoo Finance NSE
// suffix (.NS) at the call site. Used for live movers, sector heatmap, and
// pre-market / post-market Telegram scans.
export interface NiftyStock {
  symbol: string;
  name: string;
  sector: string;
}

export const NIFTY_UNIVERSE: NiftyStock[] = [
  // Energy / Oil & Gas
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { symbol: "ONGC", name: "ONGC", sector: "Energy" },
  { symbol: "IOC", name: "Indian Oil", sector: "Energy" },
  { symbol: "BPCL", name: "BPCL", sector: "Energy" },
  { symbol: "HINDPETRO", name: "HPCL", sector: "Energy" },
  { symbol: "GAIL", name: "GAIL India", sector: "Energy" },

  // IT Services
  { symbol: "TCS", name: "TCS", sector: "IT Services" },
  { symbol: "INFY", name: "Infosys", sector: "IT Services" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT Services" },
  { symbol: "HCLTECH", name: "HCL Tech", sector: "IT Services" },
  { symbol: "TECHM", name: "Tech Mahindra", sector: "IT Services" },
  { symbol: "LTIM", name: "LTIMindtree", sector: "IT Services" },
  { symbol: "PERSISTENT", name: "Persistent Systems", sector: "IT Services" },
  { symbol: "MPHASIS", name: "Mphasis", sector: "IT Services" },

  // Financials — Banks
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Financials" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Financials" },
  { symbol: "SBIN", name: "SBI", sector: "Financials" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Financials" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Financials" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", sector: "Financials" },
  { symbol: "PNB", name: "Punjab National Bank", sector: "Financials" },
  { symbol: "BANKBARODA", name: "Bank of Baroda", sector: "Financials" },
  { symbol: "IDFCFIRSTB", name: "IDFC First Bank", sector: "Financials" },

  // Financials — NBFC / Insurance
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financials" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Financials" },
  { symbol: "CHOLAFIN", name: "Cholamandalam Finance", sector: "Financials" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance", sector: "Financials" },
  { symbol: "JIOFIN", name: "Jio Financial", sector: "Financials" },
  { symbol: "HDFCLIFE", name: "HDFC Life", sector: "Financials" },
  { symbol: "SBILIFE", name: "SBI Life", sector: "Financials" },
  { symbol: "ICICIPRULI", name: "ICICI Prudential", sector: "Financials" },
  { symbol: "ICICIGI", name: "ICICI Lombard", sector: "Financials" },
  { symbol: "LICI", name: "LIC of India", sector: "Financials" },

  // Auto
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto" },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "M&M", name: "Mahindra & Mahindra", sector: "Auto" },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", sector: "Auto" },
  { symbol: "EICHERMOT", name: "Eicher Motors", sector: "Auto" },
  { symbol: "TVSMOTOR", name: "TVS Motor", sector: "Auto" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", sector: "Auto" },
  { symbol: "MOTHERSON", name: "Samvardhana Motherson", sector: "Auto" },
  { symbol: "BOSCHLTD", name: "Bosch", sector: "Auto" },

  // Pharma / Healthcare
  { symbol: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma" },
  { symbol: "DRREDDY", name: "Dr. Reddy's", sector: "Pharma" },
  { symbol: "CIPLA", name: "Cipla", sector: "Pharma" },
  { symbol: "DIVISLAB", name: "Divi's Labs", sector: "Pharma" },
  { symbol: "TORNTPHARM", name: "Torrent Pharma", sector: "Pharma" },
  { symbol: "LUPIN", name: "Lupin", sector: "Pharma" },
  { symbol: "ZYDUSLIFE", name: "Zydus Life", sector: "Pharma" },
  { symbol: "AUROPHARMA", name: "Aurobindo Pharma", sector: "Pharma" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare" },
  { symbol: "MAXHEALTH", name: "Max Healthcare", sector: "Healthcare" },

  // FMCG
  { symbol: "HINDUNILVR", name: "HUL", sector: "FMCG" },
  { symbol: "ITC", name: "ITC", sector: "FMCG" },
  { symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG" },
  { symbol: "BRITANNIA", name: "Britannia", sector: "FMCG" },
  { symbol: "GODREJCP", name: "Godrej Consumer", sector: "FMCG" },
  { symbol: "DABUR", name: "Dabur India", sector: "FMCG" },
  { symbol: "MARICO", name: "Marico", sector: "FMCG" },
  { symbol: "COLPAL", name: "Colgate-Palmolive", sector: "FMCG" },
  { symbol: "TATACONSUM", name: "Tata Consumer", sector: "FMCG" },
  { symbol: "VBL", name: "Varun Beverages", sector: "FMCG" },

  // Metals & Mining
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals" },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals" },
  { symbol: "HINDALCO", name: "Hindalco", sector: "Metals" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Metals" },
  { symbol: "VEDL", name: "Vedanta", sector: "Metals" },

  // Telecom
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },

  // Power / Utilities
  { symbol: "NTPC", name: "NTPC", sector: "Power" },
  { symbol: "POWERGRID", name: "Power Grid", sector: "Power" },
  { symbol: "TATAPOWER", name: "Tata Power", sector: "Power" },
  { symbol: "ADANIGREEN", name: "Adani Green Energy", sector: "Power" },
  { symbol: "ADANIPOWER", name: "Adani Power", sector: "Power" },
  { symbol: "ADANIENSOL", name: "Adani Energy Solutions", sector: "Power" },

  // Conglomerate / Infra / Cement
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Conglomerate" },
  { symbol: "ADANIPORTS", name: "Adani Ports", sector: "Infrastructure" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infrastructure" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "GRASIM", name: "Grasim", sector: "Cement" },
  { symbol: "DLF", name: "DLF", sector: "Realty" },
  { symbol: "LODHA", name: "Macrotech Developers", sector: "Realty" },

  // Consumer Durables & Retail
  { symbol: "DMART", name: "Avenue Supermarts", sector: "Retail" },
  { symbol: "TITAN", name: "Titan", sector: "Consumer Durables" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Consumer Durables" },
  { symbol: "HAVELLS", name: "Havells India", sector: "Consumer Durables" },
  { symbol: "VOLTAS", name: "Voltas", sector: "Consumer Durables" },
  { symbol: "PIDILITIND", name: "Pidilite Industries", sector: "Consumer Durables" },
  { symbol: "TRENT", name: "Trent", sector: "Retail" },

  // Capital Goods / Defence
  { symbol: "SIEMENS", name: "Siemens India", sector: "Capital Goods" },
  { symbol: "ABB", name: "ABB India", sector: "Capital Goods" },
  { symbol: "HAL", name: "Hindustan Aeronautics", sector: "Defence" },
  { symbol: "BEL", name: "Bharat Electronics", sector: "Defence" },

  // New-age / Services
  { symbol: "ZOMATO", name: "Zomato", sector: "Consumer Tech" },
  { symbol: "PAYTM", name: "Paytm", sector: "Consumer Tech" },
  { symbol: "NAUKRI", name: "Info Edge", sector: "Consumer Tech" },
  { symbol: "IRCTC", name: "IRCTC", sector: "Services" },
  { symbol: "INDIGO", name: "Interglobe Aviation", sector: "Services" },
  { symbol: "IRFC", name: "Indian Railway Finance", sector: "Financials" },
  { symbol: "BAJAJHLDNG", name: "Bajaj Holdings", sector: "Financials" },
];

export const NIFTY_YAHOO_SYMBOLS = NIFTY_UNIVERSE.map((s) => `${s.symbol}.NS`).join(",");

export function sectorOf(symbol: string): string {
  const clean = symbol.replace(/\.NS$/i, "").toUpperCase();
  return NIFTY_UNIVERSE.find((s) => s.symbol === clean)?.sector ?? "Other";
}

export function nameOf(symbol: string): string {
  const clean = symbol.replace(/\.NS$/i, "").toUpperCase();
  return NIFTY_UNIVERSE.find((s) => s.symbol === clean)?.name ?? clean;
}
