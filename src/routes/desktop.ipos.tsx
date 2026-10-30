import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search, ShieldCheck, Filter } from "lucide-react";

import { type IPO, type IpoCategory, VERIFIED_IPOS } from "@/lib/ipos";
import { getLiveIpos } from "@/lib/ipos.functions";
import { getListedIpos } from "@/lib/listed-ipos.functions";
import { getAppliedIpos, type AppliedIpoRecord } from "@/lib/applied-ipos";
import { IpoAnalysisModal } from "@/components/IpoAnalysisModal";
import { TrackApplicationModal } from "@/components/TrackApplicationModal";
import { IpoCard } from "@/components/ipos/IpoCard";
import { AppliedIposPanel } from "@/components/ipos/AppliedIposPanel";
import { ListedIposPanel } from "@/components/ipos/ListedIposPanel";

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
  const [trackIpo, setTrackIpo] = useState<IPO | null>(null);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [appliedList, setAppliedList] = useState<AppliedIpoRecord[]>([]);

  const handleOpenTrack = (ipo: IPO) => {
    setTrackIpo(ipo);
    setIsTrackModalOpen(true);
  };

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
    const closed = rawIpos.filter((i) => i.status === "closed" || i.status === "allotted" || i.status === "listed");
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
  const totalTabCounts = useMemo(
    () => ({
      open: grouped.open.length,
      applied: appliedList.length,
      closed: grouped.closed.length,
      upcoming: grouped.upcoming.length,
      listed: (listedQ.data?.listed ?? []).length,
    }),
    [grouped, appliedList, listedQ.data?.listed],
  );

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
        (i) => i.company.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q),
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
            Live discovery, 5-factor AI scorecard (Demand 30%, Financials 25%, Valuation 20%, GMP
            15%, Structure 10%), listing gain scenarios, and personal application tracker for NSE
            &amp; BSE Mainboard and SME IPOs.
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

      {(error || data?.source === "curated") && tab !== "listed" && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {error
              ? "Live exchange feed unavailable — showing the last curated IPO list. Subscription and status ticks may be stale."
              : "Live NSE ticks unavailable right now — showing the curated IPO list. Subscription figures may be stale."}
          </span>
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
          onOpenTrack={handleOpenTrack}
          onOpenAnalysis={(symbol) => {
            const match = rawIpos.find(
              (i) => (i.symbol || "").toUpperCase() === (symbol || "").toUpperCase(),
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
            No {category !== "ALL" ? category : ""} IPOs found in{" "}
            {TABS.find((t) => t.id === tab)?.label}
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
              appliedRecord={appliedList.find((r) => r.ipoId === ipo.id)}
              onOpenAnalysis={() => handleOpenAnalysis(ipo)}
              onOpenTrack={() => handleOpenTrack(ipo)}
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
          • <strong>Data Sources:</strong> Prospectus filings (DRHP/RHP) with SEBI, exchange
          subscription reports (NSE/BSE), and audited 3-year financials. Zero fabricated
          subscription figures or synthetic financial statements.
        </p>
        <p>
          • <strong>5-Factor AI Model:</strong> Subscription Demand (30%), Financial Quality (25%),
          Valuation vs Listed Peers (20%), GMP Sentiment (15%), and Issue Structure (10%).
        </p>
        <p>
          • <strong>GMP Advisory:</strong> Grey Market Premium is an unorganized indicator subject
          to volatility and does not guarantee listing performance. Educational use only — not
          SEBI-registered advisory.
        </p>
      </div>

      {/* Full Deep-Dive Analysis Modal */}
      {isModalOpen && selectedIpo && (
        <IpoAnalysisModal
          ipo={selectedIpo}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onAppliedChange={refreshApplied}
        />
      )}

      {/* Track Application & Lots Calculator Modal */}
      {isTrackModalOpen && trackIpo && (
        <TrackApplicationModal
          ipo={trackIpo}
          isOpen={isTrackModalOpen}
          onClose={() => setIsTrackModalOpen(false)}
          onAppliedChange={refreshApplied}
        />
      )}
    </div>
  );
}
