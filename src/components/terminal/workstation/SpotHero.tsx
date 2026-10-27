import { DataQualityBadges } from "@/components/DataQualityBadges";
import type { InstrumentConfig, WorkstationData } from "./types";

export function SpotHero({
  data,
  instrument,
  cfg,
  curSymbol,
  stale,
}: {
  data: WorkstationData;
  instrument: string;
  cfg: InstrumentConfig;
  curSymbol: string;
  stale: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pt-1">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {instrument}
          </h2>
          <span className="rounded-md border border-border bg-surface/80 px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
            {cfg.tag}
          </span>
          <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono font-bold text-cyan-400">
            {data.dataSource ?? "Server feed"}
          </span>
          <DataQualityBadges flags={stale ? { ...data, freshnessStatus: "stale" } : data} />
        </div>
        <p className="mt-0.5 text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          MULTI-PIVOT CONFLUENCE &amp; INSTITUTIONAL OPTION ORDERFLOW ENGINE
        </p>
      </div>

      <div className="text-right">
        <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {curSymbol}
          {data.spotPrice.toLocaleString("en-IN", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })}
        </div>
        <p
          className={`font-mono text-xs font-semibold ${
            data.change >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {data.change >= 0 ? "▲ +" : "▼ "}
          {data.change.toFixed(2)} ({data.changePct >= 0 ? "+" : ""}
          {data.changePct.toFixed(2)}%)
        </p>
      </div>
    </div>
  );
}
