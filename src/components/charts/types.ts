import type { useServerFn } from "@tanstack/react-start";
import type {
  getYahooFundamentals,
  getYahooFinancials,
  getYahooNews,
  getYahooHoldings,
} from "@/lib/yahoo.functions";

export type Fundamentals = Awaited<
  ReturnType<ReturnType<typeof useServerFn<typeof getYahooFundamentals>>>
>;
export type Financials = Awaited<
  ReturnType<ReturnType<typeof useServerFn<typeof getYahooFinancials>>>
>;
export type News = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooNews>>>>;
export type Holdings = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooHoldings>>>>;
