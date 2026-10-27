import { DataQualityBadges } from "@/components/DataQualityBadges";
import { useSecondsSince } from "./hooks";
import type { WorkstationData } from "./types";

function Updated({ updatedAt }: { updatedAt: number | null }) {
  const age = useSecondsSince(updatedAt);
  return <strong className="text-foreground">{age == null ? "—" : `${age}s ago`}</strong>;
}

export function StatusStrip({
  data,
  stale,
  updatedAt,
  refreshSeconds,
}: {
  data: WorkstationData | null;
  stale: boolean;
  updatedAt: number | null;
  refreshSeconds: number;
}) {
  const healthy = !!data && !data.isSimulated && !stale;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/40 p-3 text-[11px] font-mono text-muted-foreground">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${healthy ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}
        />
        <span>
          DATA FEED:{" "}
          <strong className="text-foreground">
            {data ? (data.dataSource ?? "Market data server") : "Connecting…"}
          </strong>
        </span>
        <DataQualityBadges flags={stale ? { ...data, freshnessStatus: "stale" } : data} />
      </div>
      <div className="flex items-center gap-4">
        <span>
          LAST UPDATE: <Updated updatedAt={updatedAt} />
        </span>
        <span>
          REFRESH: <strong className="text-foreground">every {refreshSeconds}s</strong>
        </span>
      </div>
    </div>
  );
}
