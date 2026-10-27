import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatINR } from "@/lib/market-data";
import { LevelCard, SentimentRow, ZoneCard } from "./cards";
import type { useMarketStatus } from "./useMarketStatus";

export type Levels = {
  target: number;
  support: number;
  resistance: number;
  upside: number;
  downside: number;
  overhead: number;
  entryLow: number;
  entryHigh: number;
  exitLow: number;
  exitHigh: number;
  stopLoss: number;
  analyst: boolean;
};

export function AnalysisCards({
  marketStatus,
  levels,
  sentiment,
  risk,
}: {
  marketStatus: ReturnType<typeof useMarketStatus>;
  levels: Levels | null;
  sentiment: { buy: number; hold: number; sell: number };
  risk: { label: string; color: string };
}) {
  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Market Status
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${marketStatus.open ? "animate-pulse bg-success" : "bg-muted-foreground"}`}
            />
            <span
              className={`font-display text-lg font-semibold ${marketStatus.open ? "text-success" : "text-muted-foreground"}`}
            >
              {marketStatus.label}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{marketStatus.countdown}</p>
        </div>
        {levels && (
          <>
            <LevelCard
              label="Target Price"
              value={formatINR(levels.target)}
              sub={`Upside: ${levels.upside >= 0 ? "+" : ""}${levels.upside.toFixed(1)}%`}
              subColor={levels.upside >= 0 ? "text-success" : "text-destructive"}
              accent="primary"
              hint={levels.analyst ? "Analyst consensus" : "Technical projection"}
            />
            <LevelCard
              label="Support Level"
              value={formatINR(levels.support)}
              sub={`Downside: ${levels.downside.toFixed(1)}%`}
              subColor="text-destructive"
              accent="success"
              hint="20-period low"
            />
            <LevelCard
              label="Resistance Level"
              value={formatINR(levels.resistance)}
              sub={`Overhead: ${levels.overhead >= 0 ? "+" : ""}${levels.overhead.toFixed(1)}%`}
              subColor="text-warning"
              accent="warning"
              hint="20-period high"
            />
          </>
        )}
      </div>

      {/* Trading zones */}
      {levels && (
        <div className="grid grid-cols-3 gap-4">
          <ZoneCard
            tone="success"
            label="Best Entry Zone"
            range={`${formatINR(levels.entryLow)} — ${formatINR(levels.entryHigh)}`}
            desc="Ideal buy zone based on technical support"
            cta="Buy"
          />
          <ZoneCard
            tone="primary"
            label="Best Exit Zone"
            range={`${formatINR(levels.exitLow)} — ${formatINR(levels.exitHigh)}`}
            desc="Profit target zone toward analyst target"
            cta="Sell"
          />
          <ZoneCard
            tone="destructive"
            label="Stop Loss Level"
            range={formatINR(levels.stopLoss)}
            desc="Exit here to cap downside risk"
            cta="Set SL"
          />
        </div>
      )}

      {/* AI sentiment + Risk metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">AI Sentiment Analysis</h3>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-[140px] w-[140px] shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Buy", value: sentiment.buy, fill: "oklch(0.72 0.17 148)" },
                      { name: "Hold", value: sentiment.hold, fill: "oklch(0.78 0.15 78)" },
                      { name: "Sell", value: sentiment.sell, fill: "oklch(0.65 0.22 25)" },
                    ]}
                    dataKey="value"
                    innerRadius={38}
                    outerRadius={62}
                    stroke="oklch(0.16 0.014 240)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    <Cell />
                    <Cell />
                    <Cell />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.014 240)",
                      border: "1px solid oklch(0.28 0.018 240)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => `${v}%`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-xs">
              <SentimentRow color="oklch(0.72 0.17 148)" label="Buy Signal" pct={sentiment.buy} />
              <SentimentRow color="oklch(0.78 0.15 78)" label="Hold" pct={sentiment.hold} />
              <SentimentRow color="oklch(0.65 0.22 25)" label="Sell" pct={sentiment.sell} />
            </ul>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">Risk Level</h3>
          <p className={`mt-3 font-display text-3xl font-semibold ${risk.color}`}>{risk.label}</p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-background">
            <div
              className={`h-full ${risk.label === "Low" ? "w-1/3 bg-success" : risk.label === "Medium" ? "w-2/3 bg-warning" : "w-full bg-destructive"}`}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Derived from realized volatility over the current interval.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">Holding Period</h3>
          <p className="mt-3 font-display text-3xl font-semibold text-primary">Medium</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Suggested: 3–12 months based on trend + fundamentals.
          </p>
        </div>
      </div>
    </>
  );
}
