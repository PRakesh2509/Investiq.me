/**
 * Upstox server-only helpers (personal, single-user setup).
 *
 * UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET and UPSTOX_ACCESS_TOKEN are read from
 * env INSIDE functions and never leave the server. Every Upstox request sends
 * `Authorization: Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`.
 */

const BASE = "https://api.upstox.com";

export type UpstoxCredentials = {
  clientId: string;
  clientSecret: string;
};

export class MissingEnvError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. Configure them in your deployment environment.`,
    );
    this.missing = missing;
  }
}

/** Thrown when Upstox rejects the configured access token. */
export class UpstoxAuthError extends Error {
  tokenExpired = true as const;
  constructor(message = TOKEN_EXPIRED_MESSAGE) {
    super(message);
  }
}

/** Reads the OAuth app credentials. Only client id + secret are ever required. */
export function readUpstoxCredentials(requireSecret = true): UpstoxCredentials {
  const clientId = process.env["UPSTOX_CLIENT_ID"] ?? "";
  const clientSecret = process.env["UPSTOX_CLIENT_SECRET"] ?? "";

  const missing: string[] = [];
  if (!clientId) missing.push("UPSTOX_CLIENT_ID");
  if (requireSecret && !clientSecret) missing.push("UPSTOX_CLIENT_SECRET");
  if (missing.length) throw new MissingEnvError(missing);

  return { clientId, clientSecret };
}

/** Message shown whenever the configured token is rejected by Upstox. */
export const TOKEN_EXPIRED_MESSAGE =
  "UPSTOX_ACCESS_TOKEN has expired. Update the environment variable in Vercel and redeploy.";

/**
 * Returns the access token from the environment. Personal single-user setup:
 * the token is provided as an env var, never through the UI, and never sent
 * to the browser.
 */
export function getAccessToken(): string {
  const token = process.env["UPSTOX_ACCESS_TOKEN"] ?? "";
  if (!token) throw new MissingEnvError(["UPSTOX_ACCESS_TOKEN"]);
  return token;
}

async function upstoxGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const detail =
      json?.errors?.[0]?.message ?? json?.message ?? text.slice(0, 300) ?? "unknown error";
    if (res.status === 401 || res.status === 403) {
      throw new UpstoxAuthError();
    }
    throw new Error(`Upstox API ${res.status}: ${detail}`);

  }
  return json as T;
}

/* ------------------------------- Underlyings ------------------------------ */

export type Underlying = {
  key: string;
  label: string;
  segment: "INDEX" | "EQ";
};

export const INDEX_UNDERLYINGS: Underlying[] = [
  { key: "NSE_INDEX|Nifty 50", label: "NIFTY", segment: "INDEX" },
  { key: "NSE_INDEX|Nifty Bank", label: "BANKNIFTY", segment: "INDEX" },
  { key: "NSE_INDEX|Nifty Fin Service", label: "FINNIFTY", segment: "INDEX" },
  { key: "NSE_INDEX|NIFTY MID SELECT", label: "MIDCPNIFTY", segment: "INDEX" },
  { key: "BSE_INDEX|SENSEX", label: "SENSEX", segment: "INDEX" },
  { key: "BSE_INDEX|BANKEX", label: "BANKEX", segment: "INDEX" },
];

/* --------------------------------- Expiries -------------------------------- */

export async function fetchExpiries(instrumentKey: string, accessToken: string) {
  const json = await upstoxGet<any>(
    `/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`,
    accessToken,
  );
  const rows: any[] = json?.data ?? [];
  const set = new Set<string>();
  for (const r of rows) if (r?.expiry) set.add(String(r.expiry));
  return [...set].sort();
}

/* ------------------------------- Option chain ------------------------------ */

export type OptionSide = {
  instrumentKey: string;
  ltp: number;
  close: number;
  volume: number;
  oi: number;
  prevOi: number;
  oiChange: number;
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};

export type OptionRow = {
  strike: number;
  call: OptionSide;
  put: OptionSide;
};

export type OptionChain = {
  underlyingKey: string;
  expiry: string;
  spot: number;
  atmStrike: number;
  pcr: number;
  maxPain: number;
  totalCallOi: number;
  totalPutOi: number;
  rows: OptionRow[];
  generatedAt: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function side(raw: any): OptionSide {
  const md = raw?.market_data ?? {};
  const gk = raw?.option_greeks ?? {};
  const oi = num(md.oi);
  const prevOi = num(md.prev_oi);
  return {
    instrumentKey: raw?.instrument_key ?? "",
    ltp: num(md.ltp),
    close: num(md.close_price),
    volume: num(md.volume),
    oi,
    prevOi,
    oiChange: oi - prevOi,
    bid: num(md.bid_price),
    bidQty: num(md.bid_qty),
    ask: num(md.ask_price),
    askQty: num(md.ask_qty),
    iv: num(gk.iv),
    delta: num(gk.delta),
    gamma: num(gk.gamma),
    theta: num(gk.theta),
    vega: num(gk.vega),
  };
}

/** Total intrinsic loss to option writers if expiry settles at `strike`. */
function painAt(rows: OptionRow[], strike: number) {
  let pain = 0;
  for (const r of rows) {
    if (strike > r.strike) pain += (strike - r.strike) * r.call.oi;
    if (strike < r.strike) pain += (r.strike - strike) * r.put.oi;
  }
  return pain;
}

export async function fetchOptionChain(
  instrumentKey: string,
  expiry: string,
  accessToken: string,
): Promise<OptionChain> {
  const json = await upstoxGet<any>(
    `/v2/option/chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(expiry)}`,
    accessToken,
  );
  const raw: any[] = json?.data ?? [];
  const rows: OptionRow[] = raw
    .map((r) => ({
      strike: num(r?.strike_price),
      call: side(r?.call_options),
      put: side(r?.put_options),
    }))
    .filter((r) => r.strike > 0)
    .sort((a, b) => a.strike - b.strike);

  const spot = num(raw[0]?.underlying_spot_price);
  const totalCallOi = rows.reduce((s, r) => s + r.call.oi, 0);
  const totalPutOi = rows.reduce((s, r) => s + r.put.oi, 0);

  let atmStrike = 0;
  let bestDist = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.strike - spot);
    if (d < bestDist) {
      bestDist = d;
      atmStrike = r.strike;
    }
  }

  let maxPain = 0;
  let minPain = Infinity;
  for (const r of rows) {
    const p = painAt(rows, r.strike);
    if (p < minPain) {
      minPain = p;
      maxPain = r.strike;
    }
  }

  return {
    underlyingKey: instrumentKey,
    expiry,
    spot,
    atmStrike,
    pcr: totalCallOi > 0 ? Number((totalPutOi / totalCallOi).toFixed(2)) : 0,
    maxPain,
    totalCallOi,
    totalPutOi,
    rows,
    generatedAt: Date.now(),
  };
}

/* ---------------------------- Market feed (WS) ---------------------------- */

/** Returns a short-lived, pre-authorized websocket URI for the market data feed. */
export async function fetchMarketFeedUri(accessToken: string): Promise<string> {
  const json = await upstoxGet<any>("/v3/feed/market-data-feed/authorize", accessToken);
  const uri = json?.data?.authorized_redirect_uri ?? json?.data?.authorizedRedirectUri;
  if (!uri) throw new Error("Upstox did not return an authorized feed URI");
  return String(uri);
}

/* --------------------------------- Search --------------------------------- */

export async function searchUnderlyings(query: string, accessToken: string) {
  const q = query.trim().toUpperCase();
  const indices = INDEX_UNDERLYINGS.filter(
    (u) => !q || u.label.includes(q) || u.key.toUpperCase().includes(q),
  );
  if (!q) return indices;

  let stocks: Underlying[] = [];
  try {
    const json = await upstoxGet<any>(
      `/v2/search/instruments?query=${encodeURIComponent(q)}&exchange=NSE`,
      accessToken,
    );
    const rows: any[] = json?.data ?? [];
    stocks = rows
      .filter((r) => String(r?.segment ?? "").includes("NSE_EQ") || r?.instrument_type === "EQ")
      .slice(0, 12)
      .map((r) => ({
        key: String(r.instrument_key ?? ""),
        label: String(r.trading_symbol ?? r.name ?? ""),
        segment: "EQ" as const,
      }))
      .filter((r) => r.key && r.label);
  } catch {
    stocks = [];
  }
  return [...indices, ...stocks];
}
