import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Layers,
  Sparkles,
  Clock,
  Shield,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import type { SensibullGreeksChartData, SensibullGreekPoint } from "@/lib/sensibull.server";

interface SensibullGreeksChartProps {
  chartData: SensibullGreeksChartData | null;
  lotSize: number;
  isGlobal?: boolean;
  currency?: string;
}

type GreekMetric = "DELTA" | "GAMMA" | "THETA" | "VEGA" | "IV";

export default function SensibullGreeksChart({
  chartData,
  lotSize,
  isGlobal = false,
  currency = "₹",
}: SensibullGreeksChartProps) {
  const [metric, setMetric] = useState<GreekMetric>("DELTA");

  const fallbackSummary = {
    atmCallDelta: 0.5,
    atmPutDelta: -0.5,
    peakGamma: 0.002,
    peakGammaStrike: chartData?.atmStrike ?? 25000,
    maxThetaBurn: 15,
    maxThetaStrike: chartData?.atmStrike ?? 25000,
    atmIv: 13.5,
  };
  const summary = chartData?.summary ?? fallbackSummary;
  const curSymbol = currency || (isGlobal ? "$" : "₹");

  // Metric-specific configurations (unconditionally declared at top level)
  const metricConfig = useMemo(() => {
    switch (metric) {
      case "DELTA":
        return {
          title: "Delta Profile (Δ)",
          unit: "Δ",
          description: `Directional sensitivity per ${curSymbol}1 underlying spot move. Calls range 0 to +1, Puts range -1 to 0.`,
          yDomain: [-1.0, 1.0],
          callKey: "callDelta",
          putKey: "putDelta",
          callColor: "#10b981",
          putColor: "#f43f5e",
        };
      case "GAMMA":
        return {
          title: "Gamma Risk Curve (Γ)",
          unit: "Γ",
          description: `Rate of change of Delta per ${curSymbol}1 spot shift. Peaks sharply at ATM strikes; highest explosive acceleration risk.`,
          yDomain: [0, +(summary ? summary.peakGamma * 1.25 : 0.05).toFixed(4)],
          callKey: "callGamma",
          putKey: "putGamma",
          callColor: "#8b5cf6",
          putColor: "#ec4899",
        };
      case "THETA":
        return {
          title: "Daily Theta Decay (Θ)",
          unit: `${curSymbol}/day`,
          description: "Holding cost per share if underlying spot is unchanged. Always negative for net long options.",
          yDomain: [-(summary ? summary.maxThetaBurn * 1.2 : 50), 0],
          callKey: "callTheta",
          putKey: "putTheta",
          callColor: "#f43f5e",
          putColor: "#f59e0b",
        };
      case "VEGA":
        return {
          title: "Vega Volatility Exposure (ν)",
          unit: `${curSymbol}/1%`,
          description: "Change in option price per 1.0% shift in Implied Volatility (IV). Highest for ATM contracts.",
          yDomain: [0, 16],
          callKey: "callVega",
          putKey: "putVega",
          callColor: "#38bdf8",
          putColor: "#a855f7",
        };
      case "IV":
        return {
          title: "Implied Volatility Smile & Skew",
          unit: "%",
          description: "Annualized implied volatility across strike prices reflecting market supply-demand pricing skew.",
          yDomain: [8, 30],
          callKey: "callIv",
          putKey: "putIv",
          callColor: "#f59e0b",
          putColor: "#3b82f6",
        };
    }
  }, [metric, summary]);

  if (!chartData || !chartData.points.length) {
    return (
      <div className="rounded-xl border border-border bg-background/50 p-6 text-center font-mono text-xs text-muted-foreground">
        <Activity className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
        Streaming Sensibull Greek View Chart Data...
      </div>
    );
  }

  const {
    symbol,
    underlyingPrice,
    expiryDate,
    atmStrike,
    daysToExpiry,
    provider,
    dataSourceStatus,
    timestamp,
    points,
  } = chartData;

  const formattedTime = new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Sensibull Header & Data Source Status */}
      <div className="rounded-xl border border-primary/20 bg-surface/80 p-3 flex flex-wrap items-center justify-between gap-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold uppercase tracking-wider text-foreground text-xs flex items-center gap-1.5">
                {isGlobal ? "GLOBAL INSTITUTIONAL GREEKS VIEW" : "SENSIBULL GREEK VIEW CHART"}
                <span className="rounded bg-primary/10 border border-primary/30 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                  {isGlobal ? "CBOE / CME REAL-TIME" : cleanProviderBadge(provider)}
                </span>
              </h4>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isGlobal
                ? `Live CBOE institutional Greek surface modeling for ${symbol} · Expiry: ${expiryDate} (${daysToExpiry} DTE)`
                : `Live Sensibull-standard Greek curve modeling for ${symbol} · Expiry: ${expiryDate} (${daysToExpiry} DTE)`}
            </p>
          </div>
        </div>

        {/* Metric Selector Pills */}
        <div className="inline-flex rounded-lg border border-border bg-background/70 p-0.5 text-[10px]">
          {(["DELTA", "GAMMA", "THETA", "VEGA", "IV"] as GreekMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-2 py-1 font-bold transition ${
                metric === m
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "DELTA" && "DELTA (Δ)"}
              {m === "GAMMA" && "GAMMA (Γ)"}
              {m === "THETA" && "THETA (Θ)"}
              {m === "VEGA" && "VEGA (ν)"}
              {m === "IV" && "IV SMILE (%)"}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        <div className="rounded-lg border border-border bg-background/50 p-2 space-y-0.5">
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">ATM DELTA (CE / PE)</span>
          <span className="text-sm font-bold text-foreground">
            +{summary.atmCallDelta.toFixed(2)} / {summary.atmPutDelta.toFixed(2)}
          </span>
          <span className="text-muted-foreground text-[9px] block">Strike {curSymbol}{atmStrike} (ATM)</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2 space-y-0.5">
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">PEAK GAMMA RISK</span>
          <span className="text-sm font-bold text-purple-400">
            {summary.peakGamma.toFixed(4)}
          </span>
          <span className="text-muted-foreground text-[9px] block">Max risk at {curSymbol}{summary.peakGammaStrike}</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2 space-y-0.5">
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">MAX DAILY THETA BURN</span>
          <span className="text-sm font-bold text-rose-400">
            -{curSymbol}{summary.maxThetaBurn.toFixed(1)}/day
          </span>
          <span className="text-muted-foreground text-[9px] block">-{curSymbol}{(summary.maxThetaBurn * lotSize).toFixed(0)}/lot daily</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2 space-y-0.5">
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">ATM IMPLIED VOLATILITY</span>
          <span className="text-sm font-bold text-amber-400">
            {summary.atmIv.toFixed(1)}%
          </span>
          <span className="text-muted-foreground text-[9px] block">
            {summary.atmIv > 20 ? "Elevated Regime" : "Normal Volatility"}
          </span>
        </div>
      </div>

      {/* Interactive Recharts Greeks Chart */}
      <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{metricConfig.title}</span>
            <span className="text-[10px] text-muted-foreground">({metricConfig.description})</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metricConfig.callColor }} />
              Call (CE) {metric}
            </span>
            {metric !== "GAMMA" && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metricConfig.putColor }} />
                Put (PE) {metric}
              </span>
            )}
            <span className="flex items-center gap-1 text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" />
              ATM ({curSymbol}{atmStrike})
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metricConfig.callColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={metricConfig.callColor} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="putGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metricConfig.putColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={metricConfig.putColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#262626" opacity={0.6} />
              <XAxis
                dataKey="strike"
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "#404040" }}
              />
              <YAxis
                stroke="#737373"
                fontSize={10}
                domain={metricConfig.yDomain as any}
                tickLine={false}
                axisLine={{ stroke: "#404040" }}
                tickFormatter={(v) => `${v}${metricConfig.unit === "%" ? "%" : ""}`}
              />

              <Tooltip content={<CustomSensibullTooltip unit={metricConfig.unit} metric={metric} curSymbol={curSymbol} />} />

              {/* Zero reference line for Delta and Theta */}
              {(metric === "DELTA" || metric === "THETA") && (
                <ReferenceLine y={0} stroke="#525252" strokeDasharray="2 2" />
              )}

              {/* Spot / ATM Reference line */}
              <ReferenceLine
                x={atmStrike}
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `ATM ${curSymbol}${atmStrike}`,
                  position: "top",
                  fill: "#a78bfa",
                  fontSize: 10,
                  fontWeight: "bold",
                }}
              />

              {/* Call Curve */}
              <Area
                type="monotone"
                dataKey={metricConfig.callKey}
                name={`Call ${metric}`}
                stroke={metricConfig.callColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#callGrad)"
              />

              {/* Put Curve */}
              {metric !== "GAMMA" && (
                <Area
                  type="monotone"
                  dataKey={metricConfig.putKey}
                  name={`Put ${metric}`}
                  stroke={metricConfig.putColor}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#putGrad)"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Educational Note */}
      <div className="rounded-lg bg-surface/50 border border-border/60 p-2 text-[9px] text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>
            <strong>{isGlobal ? "CBOE Institutional Greek Modeling:" : "Sensibull Greek View Analysis:"}</strong> Delta reflects price drift; Gamma dictates rapid acceleration near ATM; Theta penalizes buyers overnight; Vega captures IV swing vulnerability.
          </span>
        </span>
        <span className="text-muted-foreground ml-2 whitespace-nowrap">Updated {formattedTime} {isGlobal ? "UTC" : "IST"}</span>
      </div>
    </div>
  );
}

function cleanProviderBadge(provider: string): string {
  if (provider.includes("CBOE") || provider.includes("CME") || provider.includes("Global")) return "CBOE / CME GLOBAL";
  if (provider.includes("Direct")) return "SENSIBULL DIRECT API";
  return "SENSIBULL GREEKS ENGINE";
}

function CustomSensibullTooltip({ active, payload, label, unit, metric, curSymbol = "₹" }: any) {
  if (!active || !payload || !payload.length) return null;

  const data: SensibullGreekPoint = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-xl border border-border bg-popover/95 p-2.5 font-mono text-[10px] text-popover-foreground shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border pb-1 mb-1.5 gap-3">
        <span className="font-bold text-foreground text-xs">STRIKE {curSymbol}{label}</span>
        {data.isAtm && (
          <span className="rounded bg-primary px-1.5 py-0.2 text-[8px] font-bold text-primary-foreground">
            AT-THE-MONEY
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-400 font-semibold">CALL (CE) {metric}:</span>
          <span className="font-bold text-foreground">
            {(data as any)[`call${capitalize(metric.toLowerCase())}`]} {unit}
          </span>
        </div>
        {metric !== "GAMMA" && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-rose-400 font-semibold">PUT (PE) {metric}:</span>
            <span className="font-bold text-foreground">
              {(data as any)[`put${capitalize(metric.toLowerCase())}`]} {unit}
            </span>
          </div>
        )}
        <div className="pt-1 border-t border-border/50 flex items-center justify-between gap-4 text-muted-foreground text-[9px]">
          <span>CE LTP: {curSymbol}{data.callLtp}</span>
          <span>PE LTP: {curSymbol}{data.putLtp}</span>
        </div>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
