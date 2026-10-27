import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectorsTab } from "./SectorsTab";
import type { Financials, Holdings } from "./types";

type FinRow = { date: string; ts: number; revenue: number; profit: number };
type FinFilter = "both" | "revenue" | "profit";

const REVENUE_COLOR = "#E7A92A"; // gold
const PROFIT_COLOR = "#22C55E"; // green

function fmtCr(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(1)} Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(1)} L`;
  return `${v.toFixed(0)}`;
}

type LabelProps = { x?: number; y?: number; width?: number; value?: number | string };

function buildChartData(rows: FinRow[], mode: "quarterly" | "yearly") {
  // For quarterly QoQ compare to previous quarter; for yearly YoY compare to previous year.
  // For quarterly YoY, compare to same quarter previous year (i-4).
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const revGrowth = prev && prev.revenue ? ((r.revenue - prev.revenue) / prev.revenue) * 100 : 0;
    const profitGrowth =
      prev && prev.profit ? ((r.profit - prev.profit) / Math.abs(prev.profit)) * 100 : 0;
    const yoyBase = mode === "quarterly" ? rows[i - 4] : rows[i - 1];
    const revYoY =
      yoyBase && yoyBase.revenue ? ((r.revenue - yoyBase.revenue) / yoyBase.revenue) * 100 : 0;
    const profitYoY =
      yoyBase && yoyBase.profit
        ? ((r.profit - yoyBase.profit) / Math.abs(yoyBase.profit)) * 100
        : 0;
    return {
      date: r.date,
      Revenue: r.revenue,
      Profit: r.profit,
      revGrowth,
      profitGrowth,
      revYoY,
      profitYoY,
    };
  });
}

function FinancialsChart({
  title,
  subtitle,
  data,
  filter,
  growthKey,
}: {
  title: string;
  subtitle: string;
  data: ReturnType<typeof buildChartData>;
  filter: FinFilter;
  growthKey: "revGrowth" | "revYoY";
}) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-4 text-center text-xs text-muted-foreground">Not reported yet.</p>
      </div>
    );
  }
  const profitGrowthKey = growthKey === "revGrowth" ? "profitGrowth" : "profitYoY";
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: REVENUE_COLOR }} /> Revenue
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: PROFIT_COLOR }} /> Profit
          </span>
        </div>
      </div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.018 240 / 40%)"
              vertical={false}
            />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }}
              width={70}
              tickFormatter={fmtCr}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.16 0.014 240)",
                border: "1px solid oklch(0.28 0.018 240)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => fmtCr(v)}
            />
            {(filter === "both" || filter === "revenue") && (
              <Bar dataKey="Revenue" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey={growthKey}
                  position="top"
                  content={(props: unknown) => {
                    const { x, y, width, value } = props as LabelProps;
                    if (typeof value !== "number" || value === 0) return null;
                    const sign = value >= 0 ? "+" : "";
                    return (
                      <text
                        x={(x ?? 0) + (width ?? 0) / 2}
                        y={(y ?? 0) - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fill={value >= 0 ? PROFIT_COLOR : "#EF4444"}
                      >
                        {sign}
                        {value.toFixed(0)}%
                      </text>
                    );
                  }}
                />
              </Bar>
            )}
            {(filter === "both" || filter === "profit") && (
              <Bar dataKey="Profit" fill={PROFIT_COLOR} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey={profitGrowthKey}
                  position="top"
                  content={(props: unknown) => {
                    const { x, y, width, value } = props as LabelProps;
                    if (typeof value !== "number" || value === 0) return null;
                    const sign = value >= 0 ? "+" : "";
                    return (
                      <text
                        x={(x ?? 0) + (width ?? 0) / 2}
                        y={(y ?? 0) - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fill={value >= 0 ? PROFIT_COLOR : "#EF4444"}
                      >
                        {sign}
                        {value.toFixed(0)}%
                      </text>
                    );
                  }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function FinancialsTab({
  fin,
  holdings,
}: {
  fin: Financials | null;
  holdings: Holdings | null;
}) {
  const [filter, setFilter] = useState<FinFilter>("both");
  const updatedAt = useMemo(
    () =>
      new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }),
    // Recompute the "updated" stamp whenever new financials arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fin],
  );

  const hasFinancials = fin?.ok;
  const quarterly = hasFinancials ? (fin.quarterly as FinRow[]).slice(-8) : [];
  const yearly = hasFinancials ? (fin.yearly as FinRow[]).slice(-5) : [];
  const qData = buildChartData(quarterly, "quarterly");
  const yData = buildChartData(yearly, "yearly");

  return (
    <div className="mt-5 space-y-4">
      <SectorsTab holdings={holdings} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["both", "revenue", "profit"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-1 text-xs capitalize ${
                filter === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Last updated {updatedAt} IST · Auto-refresh on load
        </p>
      </div>

      {!fin ? (
        <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">
          Loading quarterly and yearly results…
        </p>
      ) : !hasFinancials ? (
        <p className="rounded-2xl border border-border bg-surface/40 p-5 text-center text-xs text-muted-foreground">
          Quarterly and yearly company results are unavailable for this ETF. Sector allocation and
          company holdings are shown above.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FinancialsChart
              title="Quarterly Results"
              subtitle="Last 8 quarters · QoQ growth"
              data={qData}
              filter={filter}
              growthKey="revGrowth"
            />
            <FinancialsChart
              title="Yearly Results"
              subtitle="Last 5 years · YoY growth"
              data={yData}
              filter={filter}
              growthKey="revGrowth"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FinTable title="Quarterly detail" data={qData} growthLabel="QoQ" yoyLabel="YoY" />
            <FinTable title="Yearly detail" data={yData} growthLabel="YoY" yoyLabel="" />
          </div>
        </>
      )}
    </div>
  );
}

function FinTable({
  title,
  data,
  growthLabel,
  yoyLabel,
}: {
  title: string;
  data: ReturnType<typeof buildChartData>;
  growthLabel: string;
  yoyLabel: string;
}) {
  if (!data.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Period</th>
              <th className="py-2">Revenue</th>
              <th className="py-2">{growthLabel} %</th>
              {yoyLabel && <th className="py-2">{yoyLabel} %</th>}
              <th className="py-2">Profit</th>
              <th className="py-2">{growthLabel} %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.date} className="border-b border-border/60">
                <td className="py-2">{r.date}</td>
                <td className="py-2">{fmtCr(r.Revenue)}</td>
                <td className={`py-2 ${r.revGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                  {r.revGrowth >= 0 ? "+" : ""}
                  {r.revGrowth.toFixed(1)}%
                </td>
                {yoyLabel && (
                  <td className={`py-2 ${r.revYoY >= 0 ? "text-success" : "text-destructive"}`}>
                    {r.revYoY >= 0 ? "+" : ""}
                    {r.revYoY.toFixed(1)}%
                  </td>
                )}
                <td className="py-2">{fmtCr(r.Profit)}</td>
                <td className={`py-2 ${r.profitGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                  {r.profitGrowth >= 0 ? "+" : ""}
                  {r.profitGrowth.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
