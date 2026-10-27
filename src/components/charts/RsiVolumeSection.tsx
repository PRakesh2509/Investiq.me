import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RsiVolumeSection({
  rsi,
  hasVolume,
  volData,
  formatVol,
}: {
  rsi: number;
  hasVolume: boolean;
  volData: Array<{ t: string; v: number }>;
  formatVol: (v: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <h3 className="font-display text-sm font-semibold">RSI (14)</h3>
        <p className="mt-2 font-display text-3xl font-semibold">
          {rsi.toFixed(1)}
          <span
            className={`ml-2 text-xs ${rsi < 30 ? "text-success" : rsi > 70 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral"}
          </span>
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-gradient-primary"
            style={{ width: `${Math.min(100, Math.max(0, rsi))}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          RSI below 30 flags oversold, above 70 flags overbought.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm font-semibold">Volume</h3>
          <span className="text-xs text-muted-foreground">
            {hasVolume
              ? `Latest ${formatVol(volData[volData.length - 1]?.v ?? 0)}`
              : "No volume data"}
          </span>
        </div>
        <div className="mt-3 h-[160px] w-full">
          {hasVolume ? (
            <ResponsiveContainer>
              <AreaChart data={volData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.15 78)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.78 0.15 78)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.28 0.018 240 / 30%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }}
                  minTickGap={48}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }}
                  width={52}
                  tickFormatter={formatVol}
                  domain={[0, "dataMax"]}
                />
                <Tooltip
                  cursor={{ stroke: "oklch(0.78 0.15 78 / 50%)", strokeWidth: 1 }}
                  contentStyle={{
                    background: "oklch(0.16 0.014 240)",
                    border: "1px solid oklch(0.28 0.018 240)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [formatVol(v), "Volume"]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="oklch(0.78 0.15 78)"
                  strokeWidth={2}
                  fill="url(#vG)"
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Volume unavailable for this range
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
