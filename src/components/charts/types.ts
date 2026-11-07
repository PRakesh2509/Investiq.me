import type { useServerFn } from "@tanstack/react-start";
import type {
  getDhanFundamentals,
  getDhanFinancials,
  getDhanNews,
  getDhanHoldings,
} from "@/lib/dhan.functions";

export type Fundamentals = Awaited<
  ReturnType<ReturnType<typeof useServerFn<typeof getDhanFundamentals>>>
>;
export type Financials = Awaited<
  ReturnType<ReturnType<typeof useServerFn<typeof getDhanFinancials>>>
>;
export type News = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getDhanNews>>>>;
export type Holdings = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getDhanHoldings>>>>;
