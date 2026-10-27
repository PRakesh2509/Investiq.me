/**
 * Public barrel for the IPO domain. Importers keep using "@/lib/ipos".
 * - types:   IPO model and related interfaces
 * - scoring: listing scenarios, 5-factor score, status resolution/labels
 * - data:    curated, verified IPO records (fallback when live feeds are unavailable)
 */
export * from "./ipos/types";
export * from "./ipos/scoring";
export * from "./ipos/data";
