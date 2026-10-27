import type {
  TerminalWorkstationData,
  WORKSTATION_INSTRUMENTS,
} from "@/lib/terminal-workstation.functions";
import type { DataQualityFlags } from "@/components/DataQualityBadges";

/** Server payload plus optional data-quality flags (may not be present on older servers). */
export type WorkstationData = TerminalWorkstationData & DataQualityFlags;

export type InstrumentConfig = (typeof WORKSTATION_INSTRUMENTS)[string];

export interface ChartToggles {
  ema9: boolean;
  ema21: boolean;
  vwap: boolean;
  supertrend: boolean;
  volume: boolean;
}

export type ChartType = "CANDLES" | "LINE";
