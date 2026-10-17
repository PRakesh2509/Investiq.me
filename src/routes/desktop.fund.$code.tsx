import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getFundData, parseMfApiResponse } from "@/lib/funds.functions";
import { FUNDS } from "@/lib/funds";
import { getYahooNews } from "@/lib/yahoo.functions";
import { ChevronLeft, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/desktop/fund/$code")({
  component: FundDetail,
});

const RANGES = [
  { id: "1mo", label: "1M", days: 30 },
  { id: "3mo", label: "3M", days: 90 },
  { id: "6mo", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "3y", label: "3Y", days: 365 * 3 },
  { id: "5y", label: "5Y", days: 365 * 5 },
  { id: "all", label: "ALL", days: 99999 },
];

function FundDetail() {
  const { code } = Route.useParams();
  const fetchFund = useServerFn(getFundData);
  const fetchNews = useServerFn(getYahooNews);
  const [hist, setHist] = useState<{ date: string; nav: number }[]>([]);
  const [schemeName, setSchemeName] = useState<string>("");
  const [fundHouse, setFundHouse] = useState<string>("");
  const [range, setRange] = useState(RANGES[3]);
  const [loading, setLoading] = useState(false);
  const [news, setNews] = useState<Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getYahooNews>>>> | null>(null);
  const [tab, setTab] = useState<"overview" | "news">("overview");

  const meta = useMemo(() => {
    const all = Object.values(FUNDS).flat();
    return all.find((f) => f.schemeCode === code) ?? null;
  }, [code]);

  const load = async () => {
    setLoading(true);
    try {
      let res;
      try {
        res = await fetchFund({ data: { schemeCode: code } });
      } catch (err) {
        console.warn("[desktop.fund.$code] server fetch failed, trying direct browser fetch", err);
      }
      if (!res || !res.ok || !res.history.length) {
        const clientRes = await fetch(`https://api.mfapi.in/mf/${code}`);
        if (clientRes.ok) {
          const json = await clientRes.json();
          res = parseMfApiResponse(json, code);
        }
      }
      if (res && res.ok) {
        setHist(res.history);
        setSchemeName(res.schemeName ?? "");
        setFundHouse(res.fundHouse ?? "");
      }
    } catch (e) {
      console.error("[desktop.fund.$code] failed to load fund", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    (async () => {
      if (!meta) return;
      const q = meta.name.split(" ").slice(0, 4).join(" ");
      const n = await fetchNews({ data: { query: q, count: 10 } });
      setNews(n);
    })();
  }, [meta, fetchNews]);

  const trimmed = useMemo(() => {
    if (!hist.length) return [];
    const slice = range.days >= 99999 ? hist : hist.slice(-range.days);
    return slice;
  }, [hist, range]);

  const latest = hist[hist.length - 1];
  const first = trimmed[0];
  const changePct = first && latest ? ((latest.nav - first.nav) / first.nav) * 100 : 0;
  const positive = changePct >= 0;

  const returns = useMemo(() => {
    const now = latest?.nav ?? 0;
    const findBack = (days: number) => hist[Math.max(0, hist.length - 1 - days)]?.nav ?? 0;
    const r = (past: number) => (past ? ((now - past) / past) * 100 : 0);
    return {
      "1M": r(findBack(30)),
      "6M": r(findBack(180)),
      "1Y": r(findBack(365)),
      "3Y": r(findBack(365 * 3)),
      "5Y": r(findBack(365 * 5)),
    };
  }, [hist, latest]);

  const name = meta?.name ?? schemeName ?? "Mutual Fund";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link to="/desktop/funds" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Mutual Funds
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold">{name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta?.amc ?? fundHouse ?? ""} · {meta?.risk ?? "—"} risk · Scheme code {code}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Latest NAV</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {latest ? `₹${latest.nav.toFixed(4)}` : "—"}
            </p>
            <p className={`text-sm ${positive ? "text-success" : "text-destructive"}`}>
              {positive ? "+" : ""}{changePct.toFixed(2)}% · {range.label}
            </p>
          </div>
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r)}
                className={`rounded-md border px-3 py-1 text-xs ${
                  range.id === r.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2 border-b border-border">
          {[
            { id: "overview" as const, label: "Overview" },
            { id: "news" as const, label: "News" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="mt-4 h-[360px] w-full">
            {trimmed.length ? (
              <ResponsiveContainer>
                <AreaChart data={trimmed} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.018 240 / 40%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} minTickGap={40} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: "oklch(0.68 0.02 245)" }} width={70} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip contentStyle={{ background: "oklch(0.16 0.014 240)", border: "1px solid oklch(0.28 0.018 240)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `₹${v.toFixed(4)}`} />
                  <Area type="monotone" dataKey="nav" stroke={positive ? "oklch(0.72 0.17 148)" : "oklch(0.65 0.22 25)"} fill="url(#nG)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading NAV history…</div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            {!news ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading news…</p>
            ) : !news.ok || news.items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No recent news for this fund.</p>
            ) : (
              <ul className="divide-y divide-border">
                {news.items.map((n: { title: string; link: string; publisher: string; providerPublishTime: number }, i: number) => (
                  <li key={i} className="py-3">
                    <a href={n.link} target="_blank" rel="noreferrer" className="text-sm hover:text-primary">
                      {n.title}
                    </a>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {n.publisher} ·{" "}
                      {n.providerPublishTime
                        ? new Date(n.providerPublishTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Returns strip */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(returns).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-surface/60 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className={`mt-1 font-display text-lg font-semibold ${v >= 0 ? "text-success" : "text-destructive"}`}>
              {v >= 0 ? "+" : ""}{v.toFixed(2)}%
            </p>
          </div>
        ))}
      </div>

      {meta && (
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <h3 className="font-display text-sm font-semibold">Fund fundamentals</h3>
          <div className="mt-3 grid grid-cols-5 gap-3 text-xs">
            {[
              ["AMC", meta.amc],
              ["Category", "—"],
              ["Expense Ratio", `${meta.expenseRatio}%`],
              ["Category Avg ER", `${meta.categoryAvgER}%`],
              ["Risk", meta.risk],
              ["Rating", "⭐".repeat(meta.rating)],
              ["Manager", meta.manager],
              ["Manager Tenure", `${meta.managerYears} yrs`],
              ["Min SIP", `₹${meta.minSip}`],
              ["Scheme Code", code],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-border bg-background/40 p-2.5">
                <p className="text-muted-foreground">{k}</p>
                <p className="mt-0.5 font-medium">{v}</p>
              </div>
            ))}
          </div>
          {meta.note && <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{meta.note}</p>}
          {meta.topHoldings?.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="text-foreground">Top holdings: </span>
              {meta.topHoldings.join(" · ")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
