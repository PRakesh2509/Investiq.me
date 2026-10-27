import type { Fundamentals } from "./types";

export function FundamentalsSection({
  fLive,
  meta,
  changePct,
  peDisplay,
  pbDisplay,
  roeDisplay,
  rows,
}: {
  fLive: Fundamentals | null;
  meta: { name: string; about: string };
  changePct: number;
  peDisplay: string;
  pbDisplay: string;
  roeDisplay: string;
  rows: Array<[string, string]>;
}) {
  return (
    <>
      {(fLive?.summary || meta.about) && (
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Deep Research Insight</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Fundamental Analysis
            </span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{fLive?.name || meta.name}</span>{" "}
            {fLive?.summary || meta.about}
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <li>
              • Operational trend: {changePct >= 0 ? "improving" : "under pressure"} over the
              current interval ({changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%).
            </li>
            <li>
              • Analyst view:{" "}
              {fLive?.recommendationKey
                ? fLive.recommendationKey.replace("_", " ").toUpperCase()
                : "Not rated"}
              .
            </li>
            <li>
              • Valuation: P/E {peDisplay} · P/B {pbDisplay} · ROE {roeDisplay}.
            </li>
            <li>
              • Risk factors: global macro headwinds, sector rotation, and liquidity conditions.
            </li>
          </ul>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Fundamentals</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Live · Yahoo Finance
          </span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-3 text-xs">
          {rows.map(([k, v]) => (
            <div
              key={k as string}
              className="rounded-lg border border-border bg-background/40 p-2.5"
            >
              <p className="text-muted-foreground">{k}</p>
              <p className="mt-0.5 font-medium">{v}</p>
            </div>
          ))}
        </div>
        {(fLive?.summary || meta.about) && (
          <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {fLive?.summary || meta.about}
          </p>
        )}
      </div>
    </>
  );
}
