import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, AlertTriangle, CircleCheck, CircleX, Flag, Search, TrendingUp, TrendingDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ipoStatusLabel, type IPO } from "@/lib/ipos";
import { getLiveIpos } from "@/lib/ipos.functions";
import { getListedIpos, type ListedIpo } from "@/lib/listed-ipos.functions";
import { getIpoResearch } from "@/lib/ipo-research.functions";
import { verdictEmoji, type IpoResearch } from "@/lib/ipo-research";


export const Route = createFileRoute("/desktop/ipos")({
  head: () => ({
    meta: [
      { title: "IPO Research Desk — InvestIQ" },
      { name: "description", content: "Institutional-grade IPO research notes: 9-factor weighted scorecard, red-flag detection, deep checks and an APPLY / AVOID verdict." },
      { property: "og:title", content: "IPO Research Desk — InvestIQ" },
      { property: "og:description", content: "9-factor weighted IPO scorecard with red flags, deep checks and a calibrated verdict." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IPOTracker,
});

type TabId = "upcoming" | "current" | "listed";
const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "upcoming", label: "Upcoming IPOs", icon: "📋" },
  { id: "current", label: "Current IPOs", icon: "📊" },
  { id: "listed", label: "Listed IPOs", icon: "✅" },
];

function IPOTracker() {
  const fetchIpos = useServerFn(getLiveIpos);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["live-ipos"],
    queryFn: () => fetchIpos(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const [tab, setTab] = useState<TabId>("upcoming");
  const fetchListed = useServerFn(getListedIpos);
  const listedQ = useQuery({
    queryKey: ["listed-ipos"],
    queryFn: () => fetchListed(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });


  const ipos = data?.ipos ?? [];
  const daysToOpen = (iso: string) => {
    if (!iso) return NaN;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);
  };
  const groups = useMemo(() => ({
    upcoming: ipos.filter((i) => i.status === "upcoming"),
    // "Current" = anything still in-flight (open, closed, awaiting allotment) plus
    // issues opening within 3 days. Once an issue's listing date arrives its status
    // flips to "listed" and it leaves this tab for the Listed IPOs table.
    current: ipos.filter(
      (i) =>
        i.status === "open" ||
        i.status === "closed" ||
        i.status === "allotted" ||
        (i.status === "upcoming" && daysToOpen(i.openDate) >= 0 && daysToOpen(i.openDate) <= 3),
    ),
    listed: [] as IPO[],
  }), [ipos]);


  const listedRows = listedQ.data?.listed ?? [];
  const counts: Record<TabId, number> = {
    upcoming: groups.upcoming.length,
    current: groups.current.length,
    listed: listedRows.length,
  };

  const activeList = groups[tab];


  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">IPO Research Desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every issue is scored independently on a transparent 5-factor model — GMP trend 25%, subscription demand 30%, financial health 20%, valuation vs peers 15%, issue size 10% — mapped to APPLY / APPLY WITH CAUTION / AVOID.
          </p>

        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = counts[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                active
                  ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
                  : "border-border bg-surface/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-background/60 text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "listed" ? (
        <ListedIposPanel
          rows={listedRows}
          isLoading={listedQ.isLoading}
          error={listedQ.error ? String(listedQ.error) : listedQ.data?.ok === false ? listedQ.data.error : undefined}
        />
      ) : isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface/40 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading live IPO data from NSE…
        </div>
      ) : (error || data?.ok === false) && activeList.length === 0 ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
          Couldn't reach NSE right now{data?.error ? `: ${data.error}` : ""}. Try Refresh in a moment.
        </div>
      ) : activeList.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
          Nothing in this tab right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {activeList.map((ipo) => (
            <IpoCard key={ipo.id} ipo={ipo} />
          ))}
        </div>
      )}


      <p className="text-xs text-muted-foreground">
        Source: NSE India public feeds + AI research engine. Factors without verified RHP data are marked Unverified and scored conservatively. Educational use only — not SEBI-registered investment advice.
      </p>
    </div>
  );
}

function inr(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ListedIposPanel({
  rows,
  isLoading,
  error,
}: {
  rows: ListedIpo[];
  isLoading: boolean;
  error?: string;
}) {
  const priced = rows.filter((r) => r.changePct != null);
  const gainers = priced.filter((r) => (r.changePct ?? 0) >= 0).length;
  const losers = priced.length - gainers;
  const avg = priced.length
    ? priced.reduce((s, r) => s + (r.changePct ?? 0), 0) / priced.length
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface/40 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading recently listed IPOs and live prices…
      </div>
    );
  }
  if (error && rows.length === 0) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
        Couldn't load listed IPOs: {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
        No recently listed IPOs found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="In profit" v={`${gainers}`} tone="success" />
        <StatBox label="In loss" v={`${losers}`} tone="destructive" />
        <StatBox
          label="Avg. return vs issue price"
          v={avg == null ? "—" : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`}
          tone={(avg ?? 0) >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">Company</th>
              <th className="px-4 py-3 text-right font-medium">Issue price</th>
              <th className="px-4 py-3 text-right font-medium">Current price</th>
              <th className="px-4 py-3 text-right font-medium">Gain / Loss</th>
              <th className="px-4 py-3 text-right font-medium">Today</th>
              <th className="px-4 py-3 text-right font-medium">Listed on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.changePct;
              const pos = (pct ?? 0) >= 0;
              return (
                <tr key={r.symbol} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {r.symbol}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{r.company}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{inr(r.issuePrice)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{inr(r.price)}</td>
                  <td className="px-4 py-3 text-right">
                    {pct == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-end gap-1 font-medium ${pos ? "text-success" : "text-destructive"}`}
                      >
                        {pos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {pos ? "+" : ""}
                        {pct.toFixed(2)}%
                        <span className="ml-1 text-[11px] opacity-80">
                          ({pos ? "+" : "−"}
                          {inr(Math.abs(r.changeAbs ?? 0))})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {r.dayChangePct == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={r.dayChangePct >= 0 ? "text-success" : "text-destructive"}>
                        {r.dayChangePct >= 0 ? "+" : ""}
                        {r.dayChangePct.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtDate(r.listingDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Gain / Loss compares the live market price with the IPO issue price. Prices refresh every 60 seconds.
      </p>
    </div>
  );
}

function StatBox({ label, v, tone }: { label: string; v: string; tone: "success" | "destructive" }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === "success" ? "text-success" : "text-destructive"}`}>
        {v}
      </p>
    </div>
  );
}


const STATUS_STYLES: Record<IPO["status"], string> = {
  upcoming: "bg-primary/15 text-primary border-primary/30",
  open: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
  allotted: "bg-warning/15 text-warning border-warning/30",
  listed: "bg-accent text-accent-foreground border-border",
};

function verdictStyle(v: IpoResearch["verdict"]): string {
  if (v === "STRONG APPLY" || v === "APPLY") return "bg-success/15 text-success border-success/30";
  if (v === "APPLY WITH CAUTION") return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function IpoCard({ ipo }: { ipo: IPO }) {
  const runResearch = useServerFn(getIpoResearch);
  const { data: r, isLoading } = useQuery({
    queryKey: ["ipo-research", ipo.id],
    queryFn: () => runResearch({ data: { ipo } }),
    staleTime: 60 * 60_000,
  });

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/60 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="truncate font-display text-lg font-semibold">{ipo.company}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{r?.sector || ipo.sector}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLES[ipo.status]}`}>
          {ipoStatusLabel(ipo.status)}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Fact label="Price band" v={ipo.priceBand} />
        <Fact label="Issue size" v={ipo.issueSize} />
        <Fact label="Fresh / OFS" v={r ? `${r.freshIssuePct} / ${r.ofsPct}` : "…"} />
        <Fact label="P/E (post-issue)" v={r?.postIssuePe ?? "…"} />
      </div>

      <div className="rounded-lg border border-border bg-background/40 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Key dates</p>
        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
          <DateChip label="Open" v={ipo.openDate} />
          <DateChip label="Close" v={ipo.closeDate} />
          <DateChip label="Allotment" v={ipo.allotmentDate} />
          <DateChip label="Listing" v={ipo.listingDate} />
        </div>
      </div>

      {isLoading || !r ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scoring this issue on the 5-factor model…
        </div>
      ) : (
        <>
          <div className={`rounded-lg border p-4 ${verdictStyle(r.verdict)}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{verdictEmoji(r.verdict)}</span>
                <div>
                  <p className="font-display text-xl font-bold uppercase tracking-wider">
                    {r.quant.recommendation.includes("APPLY") && !r.quant.recommendation.includes("CAUTION")
                      ? "BUY (APPLY)"
                      : r.quant.recommendation.includes("CAUTION")
                        ? "HOLD (APPLY WITH CAUTION)"
                        : "AVOID (DO NOT APPLY)"}
                  </p>
                  <p className="text-[10px] opacity-80">
                    {r.quant.confidence} confidence · est. listing range {r.quant.gainRange} · Model Verdict: {r.verdict}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="block rounded-full border border-current/30 bg-background/40 px-2 py-0.5 text-sm font-bold">
                  {r.quant.composite}/100
                </span>
                <span className="mt-1 block text-[10px] opacity-80">Composite score</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-primary">AI score explanation</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{r.quant.explanation}</p>
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">About the business</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{r.aboutBusiness}</p>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Profitability &amp; competitive moat
            </p>
            <p className="text-[11px] text-primary">{r.moatOneLiner}</p>
            <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
              {(r.moatBullets.length ? r.moatBullets : ["Moat detail unavailable (estimate)"]).map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              5-factor score breakdown
            </p>
            <div className="mt-2 space-y-2">
              {r.quant.factors.map((f) => (
                <div key={f.key} className="text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {f.label} <span className="text-muted-foreground">({f.weight}%)</span>
                      {f.estimate && (
                        <span
                          title="Estimated input — not verified against NSE/BSE or RHP filings"
                          className="ml-1 rounded bg-warning/15 px-1 text-[9px] font-medium text-warning"
                        >
                          estimate
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">
                      {f.points}/{f.weight}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-gradient-primary"
                      style={{ width: `${(f.points / f.weight) * 100}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{f.rationale}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {([
              ["QIB", r.subscription.qib],
              ["NII", r.subscription.nii],
              ["Retail", r.subscription.retail],
              ["Overall", r.subscription.overall],
            ] as Array<[string, number | null]>).map(([label, v]) => (
              <div key={label} className="rounded-lg border border-border bg-background/40 p-2 text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="font-display text-sm font-semibold">
                  {v == null ? "—" : `${v.toFixed(2)}x`}
                </p>
              </div>
            ))}
          </div>
          <p className="-mt-2 text-[10px] text-muted-foreground">
            Subscription demand {r.subscription.verified ? "· live NSE bid data" : "· estimate, live bid data not published yet"}
          </p>

          {r.gmpHistory.length > 1 && (
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                GMP history (₹) · estimate
              </p>
              <div className="mt-2 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={r.gmpHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#243039" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#8b98a5" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#8b98a5" }} width={30} />
                    <Tooltip
                      contentStyle={{ background: "#11171D", border: "1px solid #243039", fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="premium" stroke="#E7A92A" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {r.financialTable.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-background/40">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border text-[9px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">FY</th>
                    <th className="px-2 py-2 text-right font-medium">Revenue (₹ Cr)</th>
                    <th className="px-2 py-2 text-right font-medium">PAT (₹ Cr)</th>
                    <th className="px-2 py-2 text-right font-medium">D/E</th>
                    <th className="px-2 py-2 text-right font-medium">Promoter %</th>
                  </tr>
                </thead>
                <tbody>
                  {r.financialTable.map((row) => (
                    <tr key={row.fy} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-1.5">
                        {row.fy}
                        {row.estimate && (
                          <span title="Estimated — not verified from RHP" className="ml-1 text-warning">*</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{row.revenueCr ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{row.patCr ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{row.debtToEquity ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{row.promoterHoldingPct ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-2 py-1.5 text-[9px] text-muted-foreground">* estimate, not RHP-verified</p>
            </div>
          )}





          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-destructive">
              <Flag className="h-3 w-3" /> Red flags
            </p>
            <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
              {r.redFlags.length === 0 ? <li>• None identified</li> : r.redFlags.map((f) => <li key={f}>• {f}</li>)}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-success">
                <CircleCheck className="h-3 w-3" /> Key strengths
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                {r.strengths.map((s) => (
                  <li key={s.point}>• {s.point}<span className="block pl-2 text-[10px] italic opacity-80">{s.evidence}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-destructive">
                <CircleX className="h-3 w-3" /> Key concerns
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                {r.concerns.map((s) => (
                  <li key={s.point}>• {s.point}<span className="block pl-2 text-[10px] italic opacity-80">{s.evidence}</span></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Search className="h-3 w-3" /> Pro-level deep checks
            </p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
              {r.deepChecks.map((d) => (
                <li key={d.q}><span className="font-medium text-foreground">{d.q}:</span> {d.a}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-primary">Expected outcome range</p>
            <p className="mt-1">{r.outcomeRange}</p>
          </div>

          {r.dataGaps.length > 0 && (
            <div className="rounded-lg border border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
              <p className="text-[10px] font-medium uppercase tracking-wider">Data gaps</p>
              <ul className="mt-1 space-y-1">{r.dataGaps.map((g) => <li key={g}>• {g}</li>)}</ul>
            </div>
          )}
        </>
      )}

      <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        Research-style analysis for informational purposes only. GMP is treated as a sentiment input only. Not SEBI-registered investment advice — verify with the RHP.
      </p>
    </article>
  );
}

function Fact({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{v || "—"}</p>
    </div>
  );
}

function DateChip({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md bg-background/60 px-2 py-1.5">
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{v || "—"}</p>
    </div>
  );
}
