/**
 * Paper order persistence.
 *
 * Orders are written to the `paper_orders` table through the service-role client when
 * SUPABASE_SERVICE_ROLE_KEY is configured. Otherwise (or if the write fails) they fall back to a
 * per-isolate in-memory list, and every result reports `persistence: "memory"`.
 * The store starts empty: no seeded or fabricated orders, no fabricated P&L.
 */

import { getServiceClient } from "./api-auth.server.ts";

export type PaperMarket = "NSE_FNO" | "GLOBAL_US";
export type PriceSource = "trade_setup" | "limit_price" | "client_supplied";

export interface PaperOrder {
  orderId: string;
  status: "FILLED" | "QUEUED_FOR_OPEN" | "ACTIVE";
  market: PaperMarket;
  symbol: string;
  contract: string;
  action: "BUY" | "SELL";
  orderType: string;
  lots: number;
  lotSize: number;
  totalQuantity: number;
  fillPrice: number;
  currency: string;
  totalOutlay: number;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  stopLoss: number | null;
  timestamp: string;
  timingNote: string;
  source: string;
  priceSource: PriceSource;
  /** Paper fills are always simulated; this flag is explicit so consumers never mistake them. */
  isSimulated: boolean;
}

export type Persistence = "supabase" | "memory";

const MEMORY_LIMIT = 200;
const MEMORY_ORDERS: PaperOrder[] = [];

function toRow(o: PaperOrder) {
  return {
    order_id: o.orderId,
    status: o.status,
    market: o.market,
    symbol: o.symbol,
    contract: o.contract,
    action: o.action,
    order_type: o.orderType,
    lots: o.lots,
    lot_size: o.lotSize,
    total_quantity: o.totalQuantity,
    fill_price: o.fillPrice,
    currency: o.currency,
    total_outlay: o.totalOutlay,
    target1: o.target1,
    target2: o.target2,
    target3: o.target3,
    stop_loss: o.stopLoss,
    timing_note: o.timingNote,
    source: o.source,
    price_source: o.priceSource,
    is_simulated: o.isSimulated,
    created_at: o.timestamp,
  };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function fromRow(r: Record<string, unknown>): PaperOrder {
  return {
    orderId: String(r.order_id),
    status: r.status as PaperOrder["status"],
    market: r.market as PaperMarket,
    symbol: String(r.symbol),
    contract: String(r.contract),
    action: r.action as "BUY" | "SELL",
    orderType: String(r.order_type),
    lots: Number(r.lots),
    lotSize: Number(r.lot_size),
    totalQuantity: Number(r.total_quantity),
    fillPrice: Number(r.fill_price),
    currency: String(r.currency),
    totalOutlay: Number(r.total_outlay),
    target1: num(r.target1),
    target2: num(r.target2),
    target3: num(r.target3),
    stopLoss: num(r.stop_loss),
    timestamp: String(r.created_at),
    timingNote: String(r.timing_note ?? ""),
    source: String(r.source ?? ""),
    priceSource: (r.price_source as PriceSource) ?? "trade_setup",
    isSimulated: r.is_simulated !== false,
  };
}

export async function saveOrder(
  order: PaperOrder,
): Promise<{ persistence: Persistence; warning?: string }> {
  const client = await getServiceClient();
  let warning: string | undefined;
  if (client) {
    try {
      const { error } = await client.from("paper_orders").insert(toRow(order));
      if (!error) return { persistence: "supabase" };
      warning = "Database write failed; order kept in volatile memory only.";
      console.warn("[orders-store] insert failed:", error.message);
    } catch (err) {
      warning = "Database write failed; order kept in volatile memory only.";
      console.warn("[orders-store] insert threw:", (err as Error)?.message);
    }
  }
  MEMORY_ORDERS.unshift(order);
  if (MEMORY_ORDERS.length > MEMORY_LIMIT) MEMORY_ORDERS.length = MEMORY_LIMIT;
  return { persistence: "memory", ...(warning ? { warning } : {}) };
}

export async function listOrders(options?: {
  market?: PaperMarket;
  limit?: number;
}): Promise<{ orders: PaperOrder[]; persistence: Persistence }> {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const client = await getServiceClient();
  if (client) {
    try {
      let query = client.from("paper_orders").select("*").order("created_at", { ascending: false });
      if (options?.market) query = query.eq("market", options.market);
      const { data, error } = await query.limit(limit);
      if (!error && Array.isArray(data)) {
        return { orders: data.map(fromRow), persistence: "supabase" };
      }
      if (error) console.warn("[orders-store] select failed:", error.message);
    } catch (err) {
      console.warn("[orders-store] select threw:", (err as Error)?.message);
    }
  }
  const orders = MEMORY_ORDERS.filter((o) => !options?.market || o.market === options.market);
  return { orders: orders.slice(0, limit), persistence: "memory" };
}
