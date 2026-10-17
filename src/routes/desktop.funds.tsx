import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Star, TrendingUp, TrendingDown } from "lucide-react";
import { FUNDS, FUND_CATEGORIES, riskColor, type FundCategory, type FundStatic } from "@/lib/funds";
import { getFundData, parseMfApiResponse, type FundLiveData } from "@/lib/funds.functions";

export const Route = createFileRoute("/desktop/funds")({
  head: () => ({
    meta: [
      { title: "Mutual Funds — InvestIQ" },
      { name: "description", content: "Every mutual fund we track with live NAV, historical charts, expense ratios and returns." },
      { property: "og:title", content: "Mutual Funds — InvestIQ" },
      { property: "og:description", content: "Live NAV & performance for India's top mutual funds across 7 categories." },
    ],
  }),
  component: FundsPage,
});

type Interval = "1M" | "3M" | "1Y" | "3Y" | "5Y" | "10Y" | "ALL";
const INTERVALS: Interval[] = ["1M", "3M", "1Y", "3Y", "5Y", "10Y", "ALL"];
const DAYS: Record<Interval, number | null> = {
  "1M": 30, "3M": 91, "1Y": 365, "3Y": 3 * 365, "5Y": 5 * 365, "10Y": 10 * 365, ALL: null,
};

function parseDdMmYyyy(s: string): number {
  const [d, m, y] = s.split("-");
  return new Date(`${y}-${m}-${d}`).getTime();
}

function FundsPage() {
  const [cat, setCat] = useState<FundCategory>("index");
  const list = FUNDS[cat];
  const [selected, setSelected] = useState<FundStatic>(list[0]);
  const [interval, setInterval] = useState<Interval>("1Y");

  // Reset selected when switching categories
  const onCat = (c: FundCategory) => {
    setCat(c);
    setSelected(FUNDS[c][0]);
  };

  const fetchFund = useServerFn(getFundData);
  const { data, isFetching } = useQuery<FundLiveData>({
    queryKey: ["fund", selected.schemeCode],
    queryFn: async () => {
      try {
        const res = await fetchFund({ data: { schemeCode: selected.schemeCode } });
        if (res && res.ok && res.history.length > 0) return res;
      } catch (err) {
        console.warn("[desktop.funds] server fetch failed, trying direct browser fetch", err);
      }
      try {
        const res = await fetch(`https://api.mfapi.in/mf/${selected.schemeCode}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return parseMfApiResponse(json, selected.schemeCode);
      } catch (clientErr) {
        return {
          ok: false,
          schemeCode: selected.schemeCode,
          history: [],
          error: (clientErr as Error).message,
        };
      }
    },
    staleTime: 60 * 60_000, // NAV updates once/day
  });

  const chartData = useMemo(() => {
    if (!data?.history?.length) return [];
    const days = DAYS[interval];
    const cutoff = days === null ? 0 : Date.now() - days * 86_400_000;
    return data.history
      .filter((p) => parseDdMmYyyy(p.date) >= cutoff)
      .map((p) => ({ t: p.date, nav: p.nav }));
  }, [data, interval]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Mutual Funds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live NAV, historical charts and returns across every fund we track. Daily Telegram digest ranks the top 5 per category.
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {FUND_CATEGORIES.map((c) => {
          const active = cat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onCat(c.id)}
              className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                active
                  ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
                  : "border-border bg-surface/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {FUND_CATEGORIES.find((c) => c.id === cat)?.blurb}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-6">
        {/* Chart + selected fund summary */}
        <section className="space-y-4 rounded-2xl border border-border bg-surface/60 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">{selected.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.amc} · {selected.manager} ({selected.managerYears}y exp) ·{" "}
                <span className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${riskColor(selected.risk)}`}>
                  Risk: {selected.risk}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-semibold">
                {data?.currentNav ? `₹${data.currentNav.toFixed(2)}` : isFetching ? "…" : "—"}
              </p>
              {data?.changePct != null && (
                <p className={`mt-1 inline-flex items-center gap-1 text-xs ${data.changePct >= 0 ? "text-success" : "text-destructive"}`}>
                  {data.changePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {data.changeAbs?.toFixed(2)} ({data.changePct.toFixed(2)}%)
                </p>
              )}
              {data?.currentDate && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">as of {data.currentDate}</p>
              )}
            </div>
          </div>

          {/* Interval selector */}
          <div className="flex gap-1">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`rounded-md px-3 py-1 text-xs transition ${
                  interval === i
                    ? "bg-gradient-primary text-primary-foreground"
                    : "border border-border bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {i}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="h-[360px] w-full">
            {isFetching && !data ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading NAV history…
              </div>
            ) : !data?.ok ? (
              <div className="flex h-full items-center justify-center text-sm text-destructive">
                Couldn't load NAV data{data?.error ? `: ${data.error}` : ""}.
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No NAV points in this interval.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E7A92A" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#E7A92A" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#202830" opacity={0.6} />
                  <XAxis dataKey="t" stroke="#8a94a3" fontSize={10} minTickGap={40} />
                  <YAxis stroke="#8a94a3" fontSize={10} domain={["auto", "auto"]} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{ background: "#11171D", border: "1px solid #202830", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`₹${v.toFixed(2)}`, "NAV"]}
                  />
                  <Area type="monotone" dataKey="nav" stroke="#E7A92A" fill="url(#navFill)" strokeWidth={2} isAnimationActive={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Returns row */}
          <div className="grid grid-cols-6 gap-2 text-center text-xs">
            {[
              ["1M", data?.return1m],
              ["3M", data?.return3m],
              ["1Y", data?.return1y],
              ["3Y (p.a.)", data?.return3y],
              ["5Y (p.a.)", data?.return5y],
              ["ALL (p.a.)", data?.returnAll],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-lg border border-border bg-background/50 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                <p className={`mt-1 font-medium ${typeof v === "number" ? (v >= 0 ? "text-success" : "text-destructive") : ""}`}>
                  {typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—"}
                </p>
              </div>
            ))}
          </div>

          {/* Fund metadata */}
          <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
            <Meta label="Expense ratio" v={`${selected.expenseRatio.toFixed(2)}%`} sub={`Category avg ${selected.categoryAvgER.toFixed(2)}%`} />
            <Meta label="Min SIP" v={`₹${selected.minSip}`} sub="Monthly" />
            <Meta label="Rating" v={"★".repeat(selected.rating) + "☆".repeat(5 - selected.rating)} sub="InvestIQ score" />
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Thesis</p>
            <p className="mt-1">{selected.note}</p>
            <p className="mt-3 font-medium text-foreground">Top holdings</p>
            <p className="mt-1">{selected.topHoldings.join(" · ")}</p>
          </div>
        </section>

        {/* Full list of funds in category */}
        <aside className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              All funds · {FUND_CATEGORIES.find((c) => c.id === cat)?.label}
            </p>
            <p className="text-[10px] text-muted-foreground">{list.length} funds</p>
          </div>
          <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
            {list.map((f, i) => {
              const active = f.schemeCode === selected.schemeCode;
              const inTop5 = i < 5;
              return (
                <button
                  key={`${f.schemeCode}-${i}`}
                  onClick={() => setSelected(f)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary/5 shadow-glow"
                      : "border-border bg-surface/60 hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] text-muted-foreground">#{i + 1} · {f.amc}</p>
                        {inTop5 && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                            TOP 5 · TG
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">{f.name}</p>
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-xs text-warning">
                      <Star className="h-3 w-3 fill-warning" /> {f.rating}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>ER {f.expenseRatio.toFixed(2)}%</span>
                    <span className={`rounded-full px-2 py-0.5 ${riskColor(f.risk)}`}>{f.risk}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            NAV from AMFI (mfapi.in). Only the top 5 per category are pushed to Telegram. Past performance ≠ future results.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{v}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
