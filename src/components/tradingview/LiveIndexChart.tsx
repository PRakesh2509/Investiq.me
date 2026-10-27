import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDhanLiveChart } from "@/lib/dhan.functions";

type Point = { t: number; price: number; volume: number };

function fmtTime(t: number, intraday: boolean) {
  const d = new Date(t);
  return intraday
    ? d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

const MINUTES: Record<string, number> = { "5m": 5, "15m": 15, "60m": 60, "1h": 60, "1d": 1440 };
const DAYS: Record<string, number> = { "1d": 1, "5d": 5, "1mo": 30, "3mo": 90 };

/** Live index chart — data powered by DhanHQ API v2. Refreshes every 10s. */
export default function LiveIndexChart({
  symbol,
  label,
  interval,
  range,
  height = 520,
  dhanSymbol,
  growwSymbol,
  exchange = "NSE",
}: {
  symbol: string; // chart id key
  label: string;
  interval: string; // e.g. 5m
  range: string; // e.g. 1d
  height?: number;
  dhanSymbol?: string; // Dhan trading symbol e.g. NIFTY
  growwSymbol?: string; // legacy alias
  exchange?: "NSE" | "BSE";
}) {
  const intraday = interval !== "1d";
  const activeSymbol = dhanSymbol ?? growwSymbol ?? symbol;

  const q = useQuery({
    queryKey: ["live-index-chart", symbol, activeSymbol, interval, range],
    queryFn: () =>
      getDhanLiveChart({
        data: {
          symbol,
          dhanSymbol: activeSymbol,
          exchange,
          intervalMinutes: MINUTES[interval] ?? 5,
          days: DAYS[range] ?? 1,
        },
      }),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const points: Point[] = useMemo(() => (q.data?.ok ? (q.data.points as Point[]) : []), [q.data]);

  const last = points[points.length - 1]?.price ?? 0;
  const prevClose = q.data?.ok ? q.data.previousClose : 0;
  const change = last - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const up = change >= 0;
  const stroke = up ? "#22c55e" : "#ef4444";
  const hi = Math.max(...points.map((p) => p.price), 0);
  const lo = Math.min(...points.map((p) => p.price).filter((v) => v > 0), Infinity);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-semibold">{label}</h3>
            <span className="font-mono text-lg font-bold text-foreground">
              {last ? last.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
            </span>
            <span
              className={`font-mono text-sm font-semibold ${up ? "text-green-500" : "text-red-500"}`}
            >
              {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Live · DhanHQ Direct Feed · refreshes every 10s · H{" "}
            {hi ? hi.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"} · L{" "}
            {Number.isFinite(lo) ? lo.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"} ·
            Prev {prevClose ? prevClose.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          DhanHQ Live
        </span>
      </div>

      <div style={{ height }}>
        {points.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted-foreground">
            {q.isLoading
              ? "Loading live DhanHQ chart…"
              : q.data && !q.data.ok
                ? q.data.error
                : "No DhanHQ data for this interval right now."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <defs>
                <linearGradient id={`g-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(t) => fmtTime(t as number, intraday)}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                minTickGap={60}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) =>
                  (v as number).toLocaleString("en-IN", { maximumFractionDigits: 0 })
                }
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={70}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--surface))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelFormatter={(t) => fmtTime(t as number, intraday)}
                formatter={(v) => [
                  (v as number).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
                  label,
                ]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#g-${symbol})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
