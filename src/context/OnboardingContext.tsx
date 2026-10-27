import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type KycStatus = "pending" | "verified";

export interface Holding {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: "COMPLETE" | "PENDING" | "REJECTED";
  ts: number;
}

export interface OnboardingState {
  mobile: string;
  fullName: string;
  email: string;
  emailProvider: "google" | "manual" | null;
  pan: string;
  panStatus: KycStatus;
  aadhaarLast4: string;
  aadhaarStatus: KycStatus;
  signatureDataUrl: string;
  photoDataUrl: string;
  // App state
  cashBalance: number;
  watchlist: string[];
  holdings: Holding[];
  orders: Order[];
}

const defaultState: OnboardingState = {
  mobile: "",
  fullName: "",
  email: "",
  emailProvider: null,
  pan: "",
  panStatus: "pending",
  aadhaarLast4: "",
  aadhaarStatus: "pending",
  signatureDataUrl: "",
  photoDataUrl: "",
  cashBalance: 100000,
  watchlist: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "TATAMOTORS"],
  holdings: [
    { symbol: "RELIANCE", name: "Reliance Industries", qty: 5, avgPrice: 2820, ltp: 2954.6 },
    { symbol: "TCS", name: "Tata Consultancy Services", qty: 3, avgPrice: 3720, ltp: 3891.2 },
    { symbol: "HDFCBANK", name: "HDFC Bank", qty: 10, avgPrice: 1620, ltp: 1587.4 },
  ],
  orders: [],
};

interface OnboardingContextValue {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  reset: () => void;
  toggleWatch: (symbol: string) => void;
  placeOrder: (o: Omit<Order, "id" | "ts" | "status"> & { status?: Order["status"] }) => Order;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const STORAGE_KEY = "investiq_onboarding_v2";

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, hydrated]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      update: (patch) => setState((prev) => ({ ...prev, ...patch })),
      reset: () => setState(defaultState),
      toggleWatch: (symbol) =>
        setState((prev) => ({
          ...prev,
          watchlist: prev.watchlist.includes(symbol)
            ? prev.watchlist.filter((s) => s !== symbol)
            : [...prev.watchlist, symbol],
        })),
      placeOrder: (o) => {
        const order: Order = {
          id: `ORD${Date.now().toString().slice(-8)}`,
          ts: Date.now(),
          status: o.status ?? "COMPLETE",
          symbol: o.symbol,
          side: o.side,
          qty: o.qty,
          price: o.price,
        };
        setState((prev) => {
          const total = order.qty * order.price;
          const holdings = [...prev.holdings];
          const idx = holdings.findIndex((h) => h.symbol === order.symbol);
          if (order.side === "BUY") {
            if (idx >= 0) {
              const h = holdings[idx];
              const newQty = h.qty + order.qty;
              holdings[idx] = {
                ...h,
                qty: newQty,
                avgPrice: (h.avgPrice * h.qty + total) / newQty,
                ltp: order.price,
              };
            } else {
              holdings.push({
                symbol: order.symbol,
                name: order.symbol,
                qty: order.qty,
                avgPrice: order.price,
                ltp: order.price,
              });
            }
          } else if (idx >= 0) {
            const h = holdings[idx];
            const newQty = h.qty - order.qty;
            if (newQty <= 0) holdings.splice(idx, 1);
            else holdings[idx] = { ...h, qty: newQty, ltp: order.price };
          }
          return {
            ...prev,
            cashBalance: order.side === "BUY" ? prev.cashBalance - total : prev.cashBalance + total,
            holdings,
            orders: [order, ...prev.orders],
          };
        });
        return order;
      },
    }),
    [state],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return ctx;
}
