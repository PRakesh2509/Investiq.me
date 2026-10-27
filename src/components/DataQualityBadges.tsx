/**
 * Small, explicit data-quality badges. Server functions may flag their payloads with
 * `isSimulated`, `dataSource` and `freshnessStatus`; every field is optional and read
 * defensively so the UI never presents flagged data as plain "live" data.
 */
export interface DataQualityFlags {
  isSimulated?: boolean;
  dataSource?: string;
  freshnessStatus?: string;
}

type BadgeKind = "SIMULATED" | "DELAYED" | "STALE" | "MARKET CLOSED";

const BADGE_STYLE: Record<BadgeKind, string> = {
  SIMULATED: "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300",
  DELAYED: "border-amber-500/50 bg-amber-500/10 text-amber-400",
  STALE: "border-orange-500/50 bg-orange-500/10 text-orange-400",
  "MARKET CLOSED": "border-border bg-surface/80 text-muted-foreground",
};

function resolveDataQualityBadges(flags?: DataQualityFlags | null): BadgeKind[] {
  const out: BadgeKind[] = [];
  if (!flags) return out;
  if (flags.isSimulated) out.push("SIMULATED");
  const f = String(flags.freshnessStatus ?? "").toLowerCase();
  if (f.includes("delay")) out.push("DELAYED");
  else if (f.includes("stale")) out.push("STALE");
  else if (f.includes("closed")) out.push("MARKET CLOSED");
  return out;
}

export function DataQualityBadges({
  flags,
  marketClosed,
  className = "",
}: {
  flags?: DataQualityFlags | null;
  /** Optional hint from the caller when the market is known to be closed. */
  marketClosed?: boolean;
  className?: string;
}) {
  const kinds = resolveDataQualityBadges(flags);
  if (marketClosed && !kinds.includes("MARKET CLOSED")) kinds.push("MARKET CLOSED");
  if (!kinds.length) return null;
  const source = flags?.dataSource ? `Source: ${flags.dataSource}` : undefined;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {kinds.map((k) => (
        <span
          key={k}
          title={source}
          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${BADGE_STYLE[k]}`}
        >
          {k}
        </span>
      ))}
    </span>
  );
}
