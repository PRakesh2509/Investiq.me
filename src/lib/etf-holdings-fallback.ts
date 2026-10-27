export type EtfSectorWeight = { name: string; pct: number };
export type EtfHolding = { symbol: string; name: string; pct: number; sector: string };

type EtfProfile = {
  name: string;
  sectorWeightings: EtfSectorWeight[];
  holdings: EtfHolding[];
};

const nifty50: EtfProfile = {
  name: "Nifty 50 ETF",
  sectorWeightings: [
    { name: "Financial Services", pct: 34.6 },
    { name: "Information Technology", pct: 13.8 },
    { name: "Oil Gas & Consumable Fuels", pct: 11.1 },
    { name: "Consumer Goods", pct: 9.4 },
    { name: "Automobile", pct: 7.8 },
    { name: "Healthcare", pct: 4.2 },
    { name: "Construction", pct: 3.8 },
    { name: "Metals & Mining", pct: 3.2 },
  ],
  holdings: [
    { symbol: "HDFCBANK.NS", name: "HDFC Bank", pct: 12.3, sector: "Financial Services" },
    {
      symbol: "RELIANCE.NS",
      name: "Reliance Industries",
      pct: 9.7,
      sector: "Oil Gas & Consumable Fuels",
    },
    { symbol: "ICICIBANK.NS", name: "ICICI Bank", pct: 8.1, sector: "Financial Services" },
    { symbol: "INFY.NS", name: "Infosys", pct: 5.1, sector: "Information Technology" },
    { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", pct: 4.8, sector: "Telecom" },
    {
      symbol: "TCS.NS",
      name: "Tata Consultancy Services",
      pct: 3.9,
      sector: "Information Technology",
    },
    { symbol: "ITC.NS", name: "ITC", pct: 3.7, sector: "Consumer Goods" },
    { symbol: "LT.NS", name: "Larsen & Toubro", pct: 3.6, sector: "Construction" },
  ],
};

const bank: EtfProfile = {
  name: "Bank ETF",
  sectorWeightings: [
    { name: "Private Banks", pct: 66.2 },
    { name: "Public Sector Banks", pct: 23.5 },
    { name: "Financial Services", pct: 10.3 },
  ],
  holdings: [
    { symbol: "HDFCBANK.NS", name: "HDFC Bank", pct: 27.4, sector: "Private Banks" },
    { symbol: "ICICIBANK.NS", name: "ICICI Bank", pct: 23.1, sector: "Private Banks" },
    { symbol: "SBIN.NS", name: "State Bank of India", pct: 10.8, sector: "Public Sector Banks" },
    { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", pct: 9.7, sector: "Private Banks" },
    { symbol: "AXISBANK.NS", name: "Axis Bank", pct: 9.4, sector: "Private Banks" },
    { symbol: "BANKBARODA.NS", name: "Bank of Baroda", pct: 3.9, sector: "Public Sector Banks" },
  ],
};

const psuBank: EtfProfile = {
  name: "PSU Bank ETF",
  sectorWeightings: [
    { name: "Public Sector Banks", pct: 91.5 },
    { name: "Financial Services", pct: 8.5 },
  ],
  holdings: [
    { symbol: "SBIN.NS", name: "State Bank of India", pct: 32.8, sector: "Public Sector Banks" },
    { symbol: "BANKBARODA.NS", name: "Bank of Baroda", pct: 14.4, sector: "Public Sector Banks" },
    { symbol: "PNB.NS", name: "Punjab National Bank", pct: 12.7, sector: "Public Sector Banks" },
    { symbol: "CANBK.NS", name: "Canara Bank", pct: 10.3, sector: "Public Sector Banks" },
    {
      symbol: "UNIONBANK.NS",
      name: "Union Bank of India",
      pct: 8.9,
      sector: "Public Sector Banks",
    },
  ],
};

const it: EtfProfile = {
  name: "Nifty IT ETF",
  sectorWeightings: [{ name: "Information Technology", pct: 100 }],
  holdings: [
    {
      symbol: "TCS.NS",
      name: "Tata Consultancy Services",
      pct: 27.6,
      sector: "Information Technology",
    },
    { symbol: "INFY.NS", name: "Infosys", pct: 25.8, sector: "Information Technology" },
    { symbol: "HCLTECH.NS", name: "HCL Technologies", pct: 9.4, sector: "Information Technology" },
    { symbol: "TECHM.NS", name: "Tech Mahindra", pct: 7.1, sector: "Information Technology" },
    { symbol: "WIPRO.NS", name: "Wipro", pct: 6.9, sector: "Information Technology" },
    { symbol: "LTIM.NS", name: "LTIMindtree", pct: 6.2, sector: "Information Technology" },
  ],
};

const metal: EtfProfile = {
  name: "Metal ETF",
  sectorWeightings: [
    { name: "Metals & Mining", pct: 86.4 },
    { name: "Steel", pct: 9.1 },
    { name: "Industrial Materials", pct: 4.5 },
  ],
  holdings: [
    { symbol: "TATASTEEL.NS", name: "Tata Steel", pct: 18.9, sector: "Metals & Mining" },
    { symbol: "HINDALCO.NS", name: "Hindalco Industries", pct: 16.6, sector: "Metals & Mining" },
    { symbol: "JSWSTEEL.NS", name: "JSW Steel", pct: 15.8, sector: "Steel" },
    { symbol: "VEDL.NS", name: "Vedanta", pct: 12.4, sector: "Metals & Mining" },
    { symbol: "COALINDIA.NS", name: "Coal India", pct: 11.6, sector: "Metals & Mining" },
    { symbol: "NMDC.NS", name: "NMDC", pct: 5.7, sector: "Industrial Materials" },
  ],
};

const gold: EtfProfile = {
  name: "Gold ETF",
  sectorWeightings: [
    { name: "Gold", pct: 99.5 },
    { name: "Cash & Receivables", pct: 0.5 },
  ],
  holdings: [
    { symbol: "GOLD", name: "Physical Gold / Gold Bullion", pct: 99.5, sector: "Gold" },
    { symbol: "CASH", name: "Cash & Receivables", pct: 0.5, sector: "Cash & Receivables" },
  ],
};

const silver: EtfProfile = {
  name: "Silver ETF",
  sectorWeightings: [
    { name: "Silver", pct: 99.4 },
    { name: "Cash & Receivables", pct: 0.6 },
  ],
  holdings: [
    { symbol: "SILVER", name: "Physical Silver / Silver Bullion", pct: 99.4, sector: "Silver" },
    { symbol: "CASH", name: "Cash & Receivables", pct: 0.6, sector: "Cash & Receivables" },
  ],
};

const liquid: EtfProfile = {
  name: "Liquid ETF",
  sectorWeightings: [
    { name: "Treasury Bills", pct: 72.8 },
    { name: "Tri-Party Repo", pct: 18.4 },
    { name: "Cash & Receivables", pct: 8.8 },
  ],
  holdings: [
    { symbol: "T-BILL", name: "Government Treasury Bills", pct: 72.8, sector: "Treasury Bills" },
    { symbol: "TREPS", name: "Tri-Party Repo", pct: 18.4, sector: "Tri-Party Repo" },
    { symbol: "CASH", name: "Cash & Receivables", pct: 8.8, sector: "Cash & Receivables" },
  ],
};

const nasdaq100: EtfProfile = {
  name: "Nasdaq 100 ETF",
  sectorWeightings: [
    { name: "Technology", pct: 49.8 },
    { name: "Communication Services", pct: 15.3 },
    { name: "Consumer Discretionary", pct: 14.6 },
    { name: "Healthcare", pct: 6.8 },
    { name: "Consumer Staples", pct: 5.1 },
  ],
  holdings: [
    { symbol: "MSFT", name: "Microsoft", pct: 8.7, sector: "Technology" },
    { symbol: "AAPL", name: "Apple", pct: 8.1, sector: "Technology" },
    { symbol: "NVDA", name: "NVIDIA", pct: 7.5, sector: "Technology" },
    { symbol: "AMZN", name: "Amazon", pct: 5.2, sector: "Consumer Discretionary" },
    { symbol: "META", name: "Meta Platforms", pct: 4.8, sector: "Communication Services" },
    { symbol: "AVGO", name: "Broadcom", pct: 4.4, sector: "Technology" },
  ],
};

const midcap: EtfProfile = {
  name: "Midcap ETF",
  sectorWeightings: [
    { name: "Financial Services", pct: 20.2 },
    { name: "Capital Goods", pct: 15.5 },
    { name: "Healthcare", pct: 10.9 },
    { name: "Automobile", pct: 9.8 },
    { name: "Consumer Services", pct: 8.7 },
    { name: "Chemicals", pct: 6.5 },
  ],
  holdings: [
    { symbol: "INDHOTEL.NS", name: "Indian Hotels", pct: 3.1, sector: "Consumer Services" },
    {
      symbol: "PERSISTENT.NS",
      name: "Persistent Systems",
      pct: 2.9,
      sector: "Information Technology",
    },
    { symbol: "CUMMINSIND.NS", name: "Cummins India", pct: 2.6, sector: "Capital Goods" },
    { symbol: "BHARATFORG.NS", name: "Bharat Forge", pct: 2.4, sector: "Automobile" },
    { symbol: "LUPIN.NS", name: "Lupin", pct: 2.3, sector: "Healthcare" },
  ],
};

const next50: EtfProfile = {
  name: "Nifty Next 50 ETF",
  sectorWeightings: [
    { name: "Consumer Services", pct: 15.7 },
    { name: "Financial Services", pct: 14.8 },
    { name: "Capital Goods", pct: 11.3 },
    { name: "Healthcare", pct: 10.6 },
    { name: "Automobile", pct: 7.4 },
    { name: "Power", pct: 6.9 },
  ],
  holdings: [
    { symbol: "ADANIENT.NS", name: "Adani Enterprises", pct: 4.4, sector: "Conglomerate" },
    { symbol: "DMART.NS", name: "Avenue Supermarts", pct: 3.7, sector: "Consumer Services" },
    { symbol: "ZOMATO.NS", name: "Zomato", pct: 3.5, sector: "Consumer Services" },
    { symbol: "PFC.NS", name: "Power Finance Corporation", pct: 3.3, sector: "Financial Services" },
    { symbol: "IRCTC.NS", name: "IRCTC", pct: 3.1, sector: "Consumer Services" },
  ],
};

const cpse: EtfProfile = {
  name: "CPSE ETF",
  sectorWeightings: [
    { name: "Power", pct: 28.5 },
    { name: "Oil Gas & Consumable Fuels", pct: 26.8 },
    { name: "Capital Goods", pct: 17.3 },
    { name: "Metals & Mining", pct: 14.9 },
    { name: "Financial Services", pct: 7.2 },
  ],
  holdings: [
    { symbol: "NTPC.NS", name: "NTPC", pct: 19.5, sector: "Power" },
    { symbol: "ONGC.NS", name: "ONGC", pct: 18.9, sector: "Oil Gas & Consumable Fuels" },
    { symbol: "POWERGRID.NS", name: "Power Grid Corporation", pct: 9.8, sector: "Power" },
    { symbol: "COALINDIA.NS", name: "Coal India", pct: 8.9, sector: "Metals & Mining" },
    { symbol: "BEL.NS", name: "Bharat Electronics", pct: 8.1, sector: "Capital Goods" },
  ],
};

const exactProfiles: Record<string, EtfProfile> = {
  NIFTYBEES: nifty50,
  SETFNIF50: nifty50,
  HDFCNIFTY: nifty50,
  ICICINIFTY: nifty50,
  UTINIFTETF: nifty50,
  BANKBEES: bank,
  KOTAKBKETF: bank,
  PSUBNKBEES: psuBank,
  ITBEES: it,
  TECH: it,
  METALETF: metal,
  METALIETF: metal,
  GOLDBEES: gold,
  GOLDIETF: gold,
  SILVERBEES: silver,
  SILVERIETF: silver,
  LIQUIDBEES: liquid,
  LIQUIDETF: liquid,
  MON100: nasdaq100,
  MOM100: midcap,
  JUNIORBEES: next50,
  CPSEETF: cpse,
};

function profileFor(base: string): EtfProfile | null {
  if (exactProfiles[base]) return exactProfiles[base];
  if (base.includes("PSU") && base.includes("BANK")) return psuBank;
  if (base.includes("BANK") || base.includes("FIN")) return bank;
  if (base.includes("IT") || base.includes("TECH")) return it;
  if (base.includes("METAL")) return metal;
  if (base.includes("GOLD")) return gold;
  if (base.includes("SILVER")) return silver;
  if (base.includes("LIQUID") || base.includes("MONEY") || base.includes("CASH")) return liquid;
  if (base.includes("NASDAQ") || base.includes("MON100")) return nasdaq100;
  if (base.includes("MID") || base.includes("MOM")) return midcap;
  if (base.includes("JUNIOR") || base.includes("NEXT50")) return next50;
  if (base.includes("CPSE")) return cpse;
  if (base.includes("NIFTY") || base.includes("BEES") || base.includes("ETF")) return nifty50;
  return null;
}

export function getFallbackEtfHoldings(symbol: string) {
  const base = symbol
    .toUpperCase()
    .replace(/\.(NS|BO)$/u, "")
    .replace(/[^A-Z0-9]/gu, "");
  const profile = profileFor(base);
  if (!profile) return null;
  return {
    ok: true as const,
    name: profile.name,
    sectorWeightings: profile.sectorWeightings,
    holdings: profile.holdings,
    source: "fallback" as const,
  };
}
