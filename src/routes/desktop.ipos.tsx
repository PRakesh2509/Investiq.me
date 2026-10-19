import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  CalendarClock,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Calculator,
  Sparkles,
  Filter,
  Trash2,
  ChevronRight,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  Users,
  Check,
  Clock,
  Briefcase,
} from "lucide-react";

import {
  ipoStatusLabel,
  type IPO,
  type IpoCategory,
  type IpoStatus,
  VERIFIED_IPOS,
} from "@/lib/ipos";
import { getLiveIpos } from "@/lib/ipos.functions";
import { getListedIpos, type ListedIpo } from "@/lib/listed-ipos.functions";
import {
  getAppliedIpos,
  saveAppliedIpo,
  removeAppliedIpo,
  updateAppliedIpoStatus,
  type AppliedIpoRecord,
} from "@/lib/applied-ipos";
import { IpoAnalysisModal } from "@/components/IpoAnalysisModal";
import { formatINR } from "@/lib/market-data";
import { toast } from "sonner";

export const Route = createFileRoute("/desktop/ipos")({
  head: () => ({
    meta: [
      { title: "IPO Research Desk — InvestIQ" },
      {
        name: "description",
        content:
          "Institutional-grade Indian IPO analysis engine. Real verified DRHP/RHP data, 5-factor AI score, GMP tracking, Mainboard & SME categorization.",
      },
      { property: "og:title", content: "IPO Research Desk — InvestIQ" },
      {
        property: "og:description",
        content:
          "Institutional-grade Mainboard & SME IPO analysis engine with 5-factor AI scoring, verifiable financial statements and real-time subscription.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IPOTracker,
});

// Strict tab order as requested: Open IPO's, Applied IPO's, Closed IPO's, Upcoming IPO's (plus Listed IPO's)
type TabId = "open" | "applied" | "closed" | "upcoming" | "listed";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "open", label: "Open IPO's", icon: "🟢" },
  { id: "applied", label: "Applied IPO's", icon: "📝" },
  { id: "closed", label: "Closed IPO's", icon: "🔒" },
  { id: "upcoming", label: "Upcoming IPO's", icon: "📅" },
  { id: "listed", label: "Listed IPO's", icon: "📈" },
];

type CategoryFilter = "ALL" | "MAINBOARD" | "SME";
const CATEGORIES: CategoryFilter[] = ["ALL", "MAINBOARD", "SME"];

type SortOption = "score" | "gmp" | "subscription" | "size" | "date";

function IPOTracker() {
  const fetchIpos = useServerFn(getLiveIpos);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["live-ipos"],
    queryFn: () => fetchIpos(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const fetchListed = useServerFn(getListedIpos);
  const listedQ = useQuery({
    queryKey: ["listed-ipos"],
    queryFn: () => fetchListed(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // State
  const [tab, setTab] = useState<TabId>("open");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appliedList, setAppliedList] = useState<AppliedIpoRecord[]>([]);

  // Reload applied IPOs on mount and when changed
  const refreshApplied = () => {
    setAppliedList(getAppliedIpos());
  };

  useEffect(() => {
    refreshApplied();
  }, []);

  const rawIpos = data?.ipos ?? VERIFIED_IPOS;

  // Group IPOs by tab status
  const grouped = useMemo(() => {
    const open = rawIpos.filter((i) => i.status === "open");
    const closed = rawIpos.filter((i) => i.status === "closed" || i.status === "allotted");
    const upcoming = rawIpos.filter((i) => i.status === "upcoming");
    return { open, closed, upcoming };
  }, [rawIpos]);

  // Counts for each tab & category
  const tabCounts = useMemo(() => {
    const filterCat = (list: IPO[], cat: CategoryFilter) =>
      cat === "ALL" ? list : list.filter((i) => i.category === cat);

    const filterAppliedCat = (list: AppliedIpoRecord[], cat: CategoryFilter) =>
      cat === "ALL" ? list : list.filter((i) => i.category === cat);

    return {
      open: filterCat(grouped.open, category).length,
      applied: filterAppliedCat(appliedList, category).length,
      closed: filterCat(grouped.closed, category).length,
      upcoming: filterCat(grouped.upcoming, category).length,
      listed: (listedQ.data?.listed ?? []).length,
    };
  }, [grouped, appliedList, listedQ.data?.listed, category]);

  // Total counts across all categories for tab badges
  const totalTabCounts = useMemo(() => ({
    open: grouped.open.length,
    applied: appliedList.length,
    closed: grouped.closed.length,
    upcoming: grouped.upcoming.length,
    listed: (listedQ.data?.listed ?? []).length,
  }), [grouped, appliedList, listedQ.data?.listed]);

  // Category counts for current tab
  const categoryCounts = useMemo(() => {
    let currentPool: Array<{ category: IpoCategory }> = [];
    if (tab === "open") currentPool = grouped.open;
    else if (tab === "applied") currentPool = appliedList;
    else if (tab === "closed") currentPool = grouped.closed;
    else if (tab === "upcoming") currentPool = grouped.upcoming;

    return {
      ALL: currentPool.length,
      MAINBOARD: currentPool.filter((i) => i.category === "MAINBOARD").length,
      SME: currentPool.filter((i) => i.category === "SME").length,
    };
  }, [tab, grouped, appliedList]);

  // Filtered & Sorted IPOs for active tab
  const activeIpos = useMemo(() => {
    if (tab === "applied" || tab === "listed") return [];

    let list = grouped[tab] || [];

    // Category filter: ALL, MAINBOARD, SME
    if (category !== "ALL") {
      list = list.filter((i) => i.category === category);
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.company.toLowerCase().includes(q) ||
          i.symbol.toLowerCase().includes(q) ||
          i.sector.toLowerCase().includes(q),
      );
    }

    // Sorting
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "score":
          return b.aiScore - a.aiScore;
        case "gmp":
          return (b.gmpPct ?? -999) - (a.gmpPct ?? -999);
        case "subscription":
          return (b.subscription.total ?? 0) - (a.subscription.total ?? 0);
        case "size":
          return b.minInvestment - a.minInvestment;
        case "date":
          return (a.openDate || "").localeCompare(b.openDate || "");
        default:
          return 0;
      }
    });

    return sorted;
  }, [tab, grouped, category, search, sortBy]);

  // Filtered Applied IPOs
  const activeApplied = useMemo(() => {
    let list = appliedList;
    if (category !== "ALL") {
      list = list.filter((i) => i.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.company.toLowerCase().includes(q) ||
          i.symbol.toLowerCase().includes(q),
      );
    }
    return list;
  }, [appliedList, category, search]);

  const handleOpenAnalysis = (ipo: IPO) => {
    setSelectedIpo(ipo);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
              Institutional IPO Engine
            </span>
            <span className="rounded-md bg-surface/80 px-2 py-0.5 text-xs text-muted-foreground border border-border">
              NSE / BSE Official Feeds
            </span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Indian IPO Research Desk
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
            Live discovery, 5-factor AI scorecard (Demand 30%, Financials 25%, Valuation 20%, GMP 15%, Structure 10%), 
            listing gain scenarios, and personal application tracker for NSE &amp; BSE Mainboard and SME IPOs.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="self-start inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface/90 transition shadow-sm"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Exchange Ticks
        </button>
      </div>

      {/* Main Navigation Tabs: Strictly Open -> Applied -> Closed -> Upcoming -> Listed */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-3">
        {TABS.map((t) => {
          const count = totalTabCounts[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSearch("");
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
                active
                  ? "border-primary bg-primary/15 text-primary shadow-glow"
                  : "border-border bg-surface/60 text-muted-foreground hover:text-foreground hover:bg-surface"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  active
                    ? "bg-primary text-black"
                    : "bg-background/80 text-muted-foreground border border-border"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category Pills (ALL, MAINBOARD, SME) & Filters Toolbar (visible for non-listed tabs) */}
      {tab !== "listed" && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-border bg-surface/40 p-3.5">
          {/* Category Filters: ALL, MAINBOARD, SME */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Category:
            </span>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              const count = categoryCounts[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? cat === "SME"
                        ? "border-purple-500/50 bg-purple-500/20 text-purple-300"
                        : cat === "MAINBOARD"
                        ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                        : "border-primary bg-primary/20 text-primary"
                      : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "ALL" ? "All IPOs" : cat === "MAINBOARD" ? "Mainboard" : "SME IPOs"}
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] ${
                      active ? "bg-white/20 text-foreground font-bold" : "text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Sort Controls */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search IPO, symbol, sector…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-background/60 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {tab !== "applied" && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="score">Sort: AI Score</option>
                <option value="gmp">Sort: Highest GMP %</option>
                <option value="subscription">Sort: Total Demand</option>
                <option value="size">Sort: Min Investment</option>
                <option value="date">Sort: Issue Date</option>
              </select>
            )}
          </div>
        </div>
      )}

      {/* Main Tab Panels */}
      {tab === "listed" ? (
        <ListedIposPanel
          rows={listedQ.data?.listed ?? []}
          isLoading={listedQ.isLoading}
          error={
            listedQ.error
              ? String(listedQ.error)
              : listedQ.data?.ok === false
              ? listedQ.data.error
              : undefined
          }
        />
      ) : tab === "applied" ? (
        <AppliedIposPanel
          appliedList={activeApplied}
          allIpos={rawIpos}
          onAppliedChange={refreshApplied}
          onOpenAnalysis={(symbol) => {
            const match = rawIpos.find(
              (i) => i.symbol.toUpperCase() === symbol.toUpperCase(),
            );
            if (match) handleOpenAnalysis(match);
          }}
          onGoToOpen={() => setTab("open")}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface/40 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Synchronizing live Indian IPO issues from NSE / BSE feeds…</span>
        </div>
      ) : activeIpos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground text-base">
            No {category !== "ALL" ? category : ""} IPOs found in {TABS.find((t) => t.id === tab)?.label}
          </p>
          <p className="text-xs">
            {search
              ? `No results matching "${search}". Try clearing your search.`
              : "Check the other tabs or change your category filter."}
          </p>
          {category !== "ALL" && (
            <button
              onClick={() => setCategory("ALL")}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1 text-xs text-primary hover:bg-accent"
            >
              Reset to All IPOs
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {activeIpos.map((ipo) => (
            <IpoCard
              key={ipo.id}
              ipo={ipo}
              isApplied={appliedList.some((r) => r.ipoId === ipo.id)}
              onOpenAnalysis={() => handleOpenAnalysis(ipo)}
              onAppliedChange={refreshApplied}
            />
          ))}
        </div>
      )}

      {/* Disclaimers & Methodology Footer */}
      <div className="rounded-2xl border border-border bg-surface/30 p-4 text-[11px] text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Master Accuracy &amp; Verifiable Data Standards
        </p>
        <p>
          • <strong>Data Sources:</strong> Prospectus filings (DRHP/RHP) with SEBI, exchange subscription reports (NSE/BSE), and audited 3-year financials. 
          Zero fabricated subscription figures or synthetic financial statements.
        </p>
        <p>
          • <strong>5-Factor AI Model:</strong> Subscription Demand (30%), Financial Quality (25%), Valuation vs Listed Peers (20%), GMP Sentiment (15%), and Issue Structure (10%).
        </p>
        <p>
          • <strong>GMP Advisory:</strong> Grey Market Premium is an unorganized indicator subject to volatility and does not guarantee listing performance. Educational use only — not SEBI-registered advisory.
        </p>
      </div>

      {/* Full Deep-Dive Analysis Modal */}
      <IpoAnalysisModal
        ipo={selectedIpo}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAppliedChange={refreshApplied}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: Single IPO Card
// -----------------------------------------------------------------------------
function IpoCard({
  ipo,
  isApplied,
  onOpenAnalysis,
  onAppliedChange,
}: {
  ipo: IPO;
  isApplied: boolean;
  onOpenAnalysis: () => void;
  onAppliedChange: () => void;
}) {
  const recBadgeClass =
    ipo.recommendation === "APPLY"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : ipo.recommendation === "AVOID"
      ? "border-red-500/40 bg-red-500/10 text-red-400"
      : "border-amber-500/40 bg-amber-500/10 text-amber-400";

  const statusBadgeClass =
    ipo.status === "open"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : ipo.status === "closed"
      ? "border-border bg-surface text-muted-foreground"
      : ipo.status === "allotted"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-blue-500/30 bg-blue-500/10 text-blue-400";

  const handleToggleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isApplied) {
      removeAppliedIpo(ipo.id);
      toast.info(`Removed ${ipo.company} from Applied list`);
    } else {
      const record: AppliedIpoRecord = {
        ipoId: ipo.id,
        company: ipo.company,
        symbol: ipo.symbol,
        category: ipo.category,
        price: ipo.maxPrice,
        lotSize: ipo.lotSize,
        lotsApplied: 1,
        totalInvestment: ipo.minInvestment,
        appliedDate: new Date().toISOString().slice(0, 10),
        allotmentDate: ipo.allotmentDate,
        listingDate: ipo.listingDate,
        status: "applied",
        registrar: ipo.registrar,
        allotmentUrl: ipo.allotmentUrl,
        gmp: ipo.gmp,
      };
      saveAppliedIpo(record);
      toast.success(`Marked ${ipo.company} as Applied! (1 lot)`);
    }
    onAppliedChange();
  };

  return (
    <article
      onClick={onOpenAnalysis}
      className="group relative flex flex-col justify-between rounded-2xl border border-border bg-surface/60 p-5 hover:border-primary/50 transition cursor-pointer shadow-sm hover:shadow-glow space-y-4"
    >
      {/* Top Header Row */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                ipo.category === "SME"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
              }`}
            >
              {ipo.category} IPO
            </span>
            <span className="rounded bg-surface/80 px-2 py-0.5 text-[10px] text-muted-foreground border border-border">
              {ipo.exchange}
            </span>
            <span className="font-mono text-[11px] font-bold text-primary">
              {ipo.symbol}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${statusBadgeClass}`}
          >
            {ipo.status === "open" && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {ipoStatusLabel(ipo.status)}
          </span>
        </div>

        {/* Company & Sector */}
        <div className="mt-2.5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition">
              {ipo.company}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{ipo.sector}</p>
          </div>

          {/* AI Score & Recommendation */}
          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1.5">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${recBadgeClass}`}
              >
                {ipo.recommendation}
              </span>
              <span className="font-display text-xl font-black text-primary">
                {ipo.aiScore}
                <span className="text-[10px] font-normal text-muted-foreground">/100</span>
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Confidence: <span className="font-medium text-foreground">{ipo.confidence}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Key Financial Terms 4-Box Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Price Band</p>
          <p className="font-semibold text-foreground mt-0.5 text-sm">{ipo.priceBand}</p>
          <p className="text-[10px] text-muted-foreground">Issue: {ipo.issueSize}</p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Lot / Min Inv</p>
          <p className="font-semibold text-foreground mt-0.5 text-sm">
            {ipo.lotSize} sh ({formatINR(ipo.minInvestment)})
          </p>
          <p className="text-[10px] text-muted-foreground">1 Retail Lot</p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Subscription</p>
          <p className="font-semibold text-emerald-400 mt-0.5 text-sm">
            {ipo.subscription.total ? `${ipo.subscription.total}x` : "Awaiting"}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            QIB: {ipo.subscription.qib ? `${ipo.subscription.qib}x` : "—"} · Ret:{" "}
            {ipo.subscription.retail ? `${ipo.subscription.retail}x` : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Current GMP</p>
          <p className="font-semibold text-emerald-400 mt-0.5 text-sm">
            {ipo.gmp ? `+₹${ipo.gmp} (${ipo.gmpPct?.toFixed(1)}%)` : "Unavailable"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Est: ₹{ipo.estListingPrice || "—"}
          </p>
        </div>
      </div>

      {/* Listing Gain Scenarios Mini Bar */}
      <div className="rounded-xl border border-border/80 bg-background/40 p-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-medium flex items-center gap-1 text-foreground">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            Listing Gain Scenarios:
          </span>
          <span>Per Lot Gain</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-surface/80 p-1 border border-border/60">
            <span className="text-[10px] text-muted-foreground block">Downside</span>
            <span className="font-semibold text-destructive">
              {ipo.scenarios.downside.gainPct >= 0 ? "+" : ""}
              {ipo.scenarios.downside.gainPct}%
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {formatINR(ipo.scenarios.downside.profitPerLot)}
            </span>
          </div>

          <div className="rounded-lg bg-primary/10 p-1 border border-primary/30">
            <span className="text-[10px] text-primary block font-medium">Base (GMP)</span>
            <span className="font-semibold text-primary">
              +{ipo.scenarios.base.gainPct}%
            </span>
            <span className="block text-[10px] text-foreground font-medium">
              +{formatINR(ipo.scenarios.base.profitPerLot)}
            </span>
          </div>

          <div className="rounded-lg bg-emerald-500/10 p-1 border border-emerald-500/30">
            <span className="text-[10px] text-emerald-400 block font-medium">Upside</span>
            <span className="font-semibold text-emerald-400">
              +{ipo.scenarios.upside.gainPct}%
            </span>
            <span className="block text-[10px] text-emerald-400">
              +{formatINR(ipo.scenarios.upside.profitPerLot)}
            </span>
          </div>
        </div>
      </div>

      {/* Dates Schedule */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2.5">
        <div>
          <span>Open: </span>
          <span className="font-medium text-foreground">{fmtDate(ipo.openDate)}</span>
        </div>
        <div>
          <span>Close: </span>
          <span className="font-medium text-foreground">{fmtDate(ipo.closeDate)}</span>
        </div>
        <div>
          <span>Allotment: </span>
          <span className="font-medium text-foreground">{fmtDate(ipo.allotmentDate)}</span>
        </div>
        <div>
          <span>Listing: </span>
          <span className="font-medium text-emerald-400">{fmtDate(ipo.listingDate)}</span>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        <button
          onClick={handleToggleApply}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            isApplied
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/40"
              : "border-border bg-background/80 text-muted-foreground hover:text-foreground hover:bg-surface"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isApplied ? "Applied ✓" : "Track Application"}
        </button>

        <div className="flex items-center gap-2">
          {ipo.status === "closed" || ipo.status === "allotted" ? (
            <a
              href={ipo.allotmentUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
            >
              Registrar <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}

          <button
            onClick={onOpenAnalysis}
            className="inline-flex items-center gap-1 rounded-xl border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition"
          >
            Deep Analysis <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// Component: Applied IPOs Panel (Tracks user applications)
// -----------------------------------------------------------------------------
function AppliedIposPanel({
  appliedList,
  allIpos,
  onAppliedChange,
  onOpenAnalysis,
  onGoToOpen,
}: {
  appliedList: AppliedIpoRecord[];
  allIpos: IPO[];
  onAppliedChange: () => void;
  onOpenAnalysis: (symbol: string) => void;
  onGoToOpen: () => void;
}) {
  const totalCapital = appliedList.reduce((acc, r) => acc + (r.totalInvestment || 0), 0);
  const totalLots = appliedList.reduce((acc, r) => acc + (r.lotsApplied || 0), 0);
  const allottedCount = appliedList.filter((r) => r.status === "allotted").length;
  const potentialProfit = appliedList.reduce((acc, r) => {
    const lotGain = (r.gmp ?? 0) * r.lotSize * r.lotsApplied;
    return acc + (lotGain > 0 ? lotGain : 0);
  }, 0);

  const handleStatusChange = (
    ipoId: string,
    status: AppliedIpoRecord["status"],
  ) => {
    updateAppliedIpoStatus(ipoId, status);
    onAppliedChange();
    toast.success(`Updated status to ${status.replace("_", " ").toUpperCase()}`);
  };

  const handleRemove = (ipoId: string, company: string) => {
    removeAppliedIpo(ipoId);
    onAppliedChange();
    toast.info(`Removed ${company} from applied tracking`);
  };

  if (appliedList.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-12 text-center space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <Briefcase className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold">No Applied IPOs Tracked Yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Keep track of all your IPO bids, application amounts, lot sizes, blocked UPI funds, and allotment results in one place.
          </p>
        </div>
        <button
          onClick={onGoToOpen}
          className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-2 text-xs font-bold text-black shadow-glow hover:opacity-90 transition"
        >
          Browse Open IPOs to Apply
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">Total Capital Blocked</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{formatINR(totalCapital)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Across {appliedList.length} applications</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">Lots Applied</p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">{totalLots} Lots</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Total bidding exposure</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">Est. GMP Profit</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-400">+{formatINR(potentialProfit)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">At current grey market premium</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">Allotment Status</p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-400">
            {allottedCount} / {appliedList.length}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Successful allotments</p>
        </div>
      </div>

      {/* Applied IPOs Table / Cards */}
      <div className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
        <div className="border-b border-border/80 bg-background/40 px-5 py-3">
          <h3 className="font-display text-sm font-semibold">Active &amp; Past IPO Applications</h3>
        </div>

        <div className="divide-y divide-border/60">
          {appliedList.map((record) => {
            const statusColor =
              record.status === "allotted"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : record.status === "not_allotted"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : "bg-blue-500/15 text-blue-400 border-blue-500/30";

            return (
              <div
                key={record.ipoId}
                className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-accent/20 transition"
              >
                {/* Info Column */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        record.category === "SME"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      {record.category}
                    </span>
                    <span className="font-mono text-xs font-bold text-primary">{record.symbol}</span>
                    <h4 className="font-display text-base font-bold text-foreground truncate">
                      {record.company}
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      Lots: <strong className="text-foreground">{record.lotsApplied}</strong> ({record.lotsApplied * record.lotSize} Shares)
                    </span>
                    <span>•</span>
                    <span>
                      Capital: <strong className="text-foreground">{formatINR(record.totalInvestment)}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Cut-off Price: <strong className="text-foreground">₹{record.price}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Allotment Date: <strong className="text-foreground">{fmtDate(record.allotmentDate)}</strong>
                    </span>
                  </div>
                </div>

                {/* Status Selector & Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Status</span>
                    <select
                      value={record.status}
                      onChange={(e) =>
                        handleStatusChange(
                          record.ipoId,
                          e.target.value as AppliedIpoRecord["status"],
                        )
                      }
                      className={`mt-0.5 rounded-lg border px-2.5 py-1 text-xs font-semibold focus:outline-none ${statusColor}`}
                    >
                      <option value="applied" className="bg-hero text-blue-400">Applied (Blocked)</option>
                      <option value="allotted" className="bg-hero text-emerald-400">Allotted 🎉</option>
                      <option value="not_allotted" className="bg-hero text-red-400">Not Allotted</option>
                    </select>
                  </div>

                  <a
                    href={record.allotmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition"
                    title={`Check on ${record.registrar}`}
                  >
                    Registrar <ExternalLink className="h-3 w-3" />
                  </a>

                  <button
                    onClick={() => onOpenAnalysis(record.symbol)}
                    className="inline-flex items-center gap-1 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition"
                  >
                    Analysis
                  </button>

                  <button
                    onClick={() => handleRemove(record.ipoId, record.company)}
                    className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive/40 transition"
                    title="Remove application"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: Listed IPOs Live Performance Panel
// -----------------------------------------------------------------------------
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
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface/40 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading live prices of recently listed Indian IPOs…
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
        <StatBox label="Trading In Profit" v={`${gainers} Issues`} tone="success" />
        <StatBox label="Trading In Loss" v={`${losers} Issues`} tone="destructive" />
        <StatBox
          label="Avg. Return vs Issue Price"
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
                        className={`inline-flex items-center justify-end gap-1 font-medium ${
                          pos ? "text-emerald-400" : "text-destructive"
                        }`}
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
                      <span className={r.dayChangePct >= 0 ? "text-emerald-400" : "text-destructive"}>
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
        Gain / Loss compares the live market price with the official IPO issue price. Prices refresh every 60 seconds from exchange data.
      </p>
    </div>
  );
}

function StatBox({ label, v, tone }: { label: string; v: string; tone: "success" | "destructive" }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === "success" ? "text-emerald-400" : "text-destructive"}`}>
        {v}
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
