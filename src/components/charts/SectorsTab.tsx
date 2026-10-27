import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SECTOR_PALETTE, titleize } from "./constants";
import type { Holdings } from "./types";

type SectorGroup = {
  name: string;
  percentage: number;
  color: string;
  companies: { symbol: string; name: string; pct: number }[];
};

export function SectorsTab({ holdings }: { holdings: Holdings | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo<SectorGroup[]>(() => {
    if (!holdings || !holdings.ok) return [];
    const buckets = new Map<string, { symbol: string; name: string; pct: number }[]>();
    for (const h of holdings.holdings ?? []) {
      const key = h.sector || "Other";
      const arr = buckets.get(key) ?? [];
      arr.push({ symbol: h.symbol, name: h.name || h.symbol, pct: h.pct });
      buckets.set(key, arr);
    }
    let list: SectorGroup[] = Array.from(buckets.entries()).map(([sec, companies], i) => ({
      name: sec,
      percentage: Number(companies.reduce((a, b) => a + b.pct, 0).toFixed(2)),
      color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
      companies: companies.sort((a, b) => b.pct - a.pct),
    }));
    if (list.length === 0 || (list.length === 1 && list[0].name === "Other")) {
      list = (holdings.sectorWeightings ?? []).map((sw, i) => ({
        name: titleize(sw.name),
        percentage: Number(sw.pct.toFixed(2)),
        color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
        companies: [],
      }));
    }
    return list.sort((a, b) => b.percentage - a.percentage);
  }, [holdings]);

  if (!holdings)
    return (
      <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">
        Loading trending sectors and holdings…
      </p>
    );
  if (groups.length === 0)
    return (
      <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">
        No sector allocation data available for this ticker.
      </p>
    );

  const active = groups.find((g) => g.name === selected) ?? groups[0];

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Trending Sectors & ETF Holdings</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Sector allocation pie chart with company list
          </p>
        </div>
        {holdings.ok && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {holdings.name}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-background/40 p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Trending sectors
          </p>
          <ul className="space-y-1">
            {groups.map((g) => {
              const on = g.name === active.name;
              return (
                <li key={g.name}>
                  <button
                    onClick={() => setSelected(g.name)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                      on
                        ? "border-primary/50 bg-primary/10"
                        : "border-transparent hover:bg-accent/40"
                    }`}
                  >
                    <span
                      className="h-4 w-1 shrink-0 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {g.percentage.toFixed(2)}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="h-[360px] rounded-xl border border-border bg-background/40 p-3">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={groups}
                dataKey="percentage"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={125}
                paddingAngle={2}
                onClick={(d: { name?: string }) => d?.name && setSelected(d.name)}
              >
                {groups.map((g) => (
                  <Cell
                    key={g.name}
                    fill={g.color}
                    opacity={g.name === active.name ? 1 : 0.55}
                    style={{ cursor: "pointer", outline: "none" }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.16 0.014 240)",
                  border: "1px solid oklch(0.28 0.018 240)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: unknown, _n: unknown, p: { payload?: { name?: string } }) => [
                  `${Number(v).toFixed(2)}%`,
                  p.payload?.name ?? "",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-background/40 p-3">
          <p className="mb-2 truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Companies in {active.name}
          </p>
          {active.companies.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No per-company breakdown for this sector.
            </p>
          ) : (
            <ul className="space-y-1">
              {active.companies.map((c) => (
                <li
                  key={c.symbol + c.name}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] font-semibold" title={c.name}>
                      {c.symbol || "—"}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground" title={c.name}>
                      {c.name}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {c.pct.toFixed(2)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
