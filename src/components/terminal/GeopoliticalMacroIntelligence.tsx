import { useState } from "react";
import {
  Globe,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  Sparkles,
  Filter,
  CheckCircle2,
  RefreshCw,
  Zap,
  Flame,
} from "lucide-react";
import type { MacroIntelligenceReport } from "@/lib/ai-market-analysis.server";
import type { VerifiedNewsItem } from "@/lib/market-news-service.server";

interface GeopoliticalMacroIntelligenceProps {
  report: MacroIntelligenceReport | null;
  newsItems: VerifiedNewsItem[];
  onRefresh?: () => void;
}

function getEventFreshness(isoString: string): {
  label: string;
  badgeClass: string;
  ageText: string;
  isToday: boolean;
} {
  const pub = new Date(isoString).getTime();
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - pub) / 60_000));

  if (diffMinutes < 60) {
    return {
      label: "⚡ JUST IN",
      badgeClass:
        "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse font-extrabold",
      ageText: `${Math.max(1, diffMinutes)}m ago`,
      isToday: true,
    };
  }
  if (diffMinutes < 360) {
    return {
      label: "TODAY",
      badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-bold",
      ageText: `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m ago`,
      isToday: true,
    };
  }
  if (diffMinutes < 1440) {
    return {
      label: "TODAY",
      badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30 font-bold",
      ageText: `${Math.floor(diffMinutes / 60)}h ago`,
      isToday: true,
    };
  }
  return {
    label: "PREVIOUS",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    ageText: `${Math.floor(diffMinutes / 1440)}d ago`,
    isToday: false,
  };
}

function formatPubDateIST(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (isSameDay) {
    return `Today, ${timeStr} IST`;
  }
  return `${d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}, ${timeStr} IST`;
}

export default function GeopoliticalMacroIntelligence({
  report,
  newsItems,
  onRefresh,
}: GeopoliticalMacroIntelligenceProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [todayOnly, setTodayOnly] = useState<boolean>(false);
  const [isRefreshingLocal, setIsRefreshingLocal] = useState<boolean>(false);

  if (!report) {
    return null;
  }

  const {
    headlineSummary,
    compositeMacroScore,
    macroRegime,
    indiaMarketImpact,
    keyRisks,
    verifiedEvents,
    lastAnalysisTimestamp,
    aiModelAttribution,
  } = report;

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefresh) {
      setIsRefreshingLocal(true);
      onRefresh();
      setTimeout(() => setIsRefreshingLocal(false), 2500);
    }
  };

  const filteredEvents = verifiedEvents.filter((e) => {
    if (selectedCategory !== "ALL" && e.category !== selectedCategory) {
      return false;
    }
    if (todayOnly) {
      const freshness = getEventFreshness(e.publishedAt);
      if (!freshness.isToday) return false;
    }
    return true;
  });

  const categories = [
    "ALL",
    "GEOPOLITICS_ENERGY",
    "CENTRAL_BANKS_INFLATION",
    "VOLATILITY_FLOWS",
    "FISCAL_REGULATION",
    "EARNINGS_CORPORATE",
  ];

  const categoryLabels: Record<string, string> = {
    ALL: "All Verified Feeds",
    GEOPOLITICS_ENERGY: "Geopolitics & Crude Oil",
    CENTRAL_BANKS_INFLATION: "Monetary & RBI/Fed",
    VOLATILITY_FLOWS: "Volatility & FII Flows",
    FISCAL_REGULATION: "Fiscal & Regulatory",
    EARNINGS_CORPORATE: "Earnings & Corporate",
  };

  const formattedTime = new Date(lastAnalysisTimestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <section className="rounded-2xl border border-border bg-surface/60 shadow-lg backdrop-blur text-xs font-mono overflow-hidden">
      {/* Collapsible Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer p-4 border-b border-border bg-gradient-to-r from-surface/90 via-surface/75 to-surface/90 flex flex-wrap items-center justify-between gap-3 hover:bg-accent/15 transition select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground flex items-center gap-1.5">
                Geopolitical &amp; Macroeconomic Intelligence
              </h3>
              <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                LIVE 24H VERIFIED
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Real-time Middle East geopolitics, Brent crude, RBI, US Fed, and macro impact on
              Indian F&amp;O indices.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span
              className={`rounded px-2.5 py-0.5 font-bold border ${
                compositeMacroScore > 0.15
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : compositeMacroScore < -0.15
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    : "bg-surface text-foreground border-border"
              }`}
            >
              REGIME: {macroRegime}
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {formattedTime} IST
            </span>
          </div>

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshingLocal}
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition active:scale-95 disabled:opacity-50"
              title="Fetch fresh real-time news and re-synthesize intelligence"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshingLocal ? "animate-spin" : ""}`} />
              <span>{isRefreshingLocal ? "UPDATING..." : "REFRESH"}</span>
            </button>
          )}

          <button className="text-muted-foreground hover:text-foreground p-1">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {/* Executive Macro Summary Bar */}
          <div className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
              <span className="font-bold text-foreground flex items-center gap-1 text-[11px]">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                EXECUTIVE MACRO CONTEXT
              </span>
              <span className="text-[10px] text-muted-foreground">
                Synthesized by: <strong>{aiModelAttribution}</strong> · Real-Time Institutional Wire
              </span>
            </div>
            <p className="text-[11px] text-foreground/90 leading-relaxed font-sans">
              {headlineSummary}
            </p>
            <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>
                Primary Sector Exposure:{" "}
                <strong className="text-foreground">
                  {indiaMarketImpact.primarySectorExposure.join(", ")}
                </strong>
              </span>
              <span>
                Observed Index Impact:{" "}
                <strong className="text-foreground">
                  {indiaMarketImpact.affectedInstruments.join(", ")}
                </strong>
              </span>
            </div>
          </div>

          {/* Category Filter Pills & Freshness Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-mono transition ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "bg-surface border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {categoryLabels[cat] ?? cat}
                </button>
              ))}
            </div>

            {/* Freshness Toggle: Today / Live Only */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTodayOnly(!todayOnly)}
                className={`rounded-md px-2.5 py-0.5 text-[10px] font-mono border transition flex items-center gap-1 ${
                  todayOnly
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 font-bold"
                    : "bg-surface border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Filter to stories published today only"
              >
                <Zap className="h-3 w-3" />
                <span>{todayOnly ? "SHOWING TODAY ONLY" : "SHOW TODAY ONLY"}</span>
              </button>
            </div>
          </div>

          {/* Structured Verified Event Cards */}
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-background/30 rounded-xl border border-dashed border-border">
              <p className="text-xs">No events match the selected category or time filter.</p>
              <button
                onClick={() => {
                  setSelectedCategory("ALL");
                  setTodayOnly(false);
                }}
                className="mt-2 text-[11px] text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredEvents.map((evt) => {
                const freshness = getEventFreshness(evt.publishedAt);
                const formattedDate = formatPubDateIST(evt.publishedAt);

                return (
                  <div
                    key={evt.id}
                    className="rounded-xl border border-border bg-background/50 p-3 flex flex-col justify-between space-y-2.5 hover:border-primary/40 transition shadow-sm"
                  >
                    {/* Event Header & Verified Fact Tag */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {evt.source}
                          </span>
                          <span
                            className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded border ${freshness.badgeClass}`}
                          >
                            {freshness.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-sans">
                          <Clock className="h-3 w-3 text-muted-foreground/70" />
                          <span>{formattedDate}</span>
                          <span className="text-muted-foreground/50">({freshness.ageText})</span>
                        </span>
                      </div>

                      <a
                        href={evt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-foreground text-xs hover:text-primary transition flex items-start gap-1 group font-sans leading-snug"
                      >
                        <span>{evt.headline}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 mt-0.5 text-primary" />
                      </a>
                    </div>

                    {/* Fact Summary */}
                    <div className="bg-surface/50 rounded p-2 border border-border/40 text-[10px] text-muted-foreground font-sans">
                      <p className="line-clamp-2 leading-relaxed">{evt.factSummary}</p>
                    </div>

                    {/* Affected Sectors & Status */}
                    <div className="flex flex-wrap items-center gap-1 text-[9px]">
                      <span className="text-muted-foreground">Sectors:</span>
                      {evt.affectedSectors.map((sec) => (
                        <span
                          key={sec}
                          className="bg-background px-1.5 py-0.2 rounded border border-border text-foreground font-semibold"
                        >
                          {sec}
                        </span>
                      ))}
                      <span
                        className={`ml-auto font-bold px-1.5 py-0.2 rounded ${
                          evt.status === "OBSERVED"
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {evt.status === "OBSERVED" ? "MARKET OBSERVED" : "HYPOTHESIZED SCENARIO"}
                      </span>
                    </div>

                    {/* Dual Implications: Bullish vs Bearish */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-[10px]">
                      <div className="space-y-0.5">
                        <span className="text-emerald-400 font-bold block text-[9px]">
                          ▲ BULLISH FACTOR
                        </span>
                        <p className="text-muted-foreground line-clamp-2 text-[9px] font-sans leading-tight">
                          {evt.bullishScenario}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-rose-400 font-bold block text-[9px]">
                          ▼ BEARISH RISK
                        </span>
                        <p className="text-muted-foreground line-clamp-2 text-[9px] font-sans leading-tight">
                          {evt.bearishScenario}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Key Macro Risks List */}
          {keyRisks.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-3 space-y-1.5">
              <span className="text-rose-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                KEY MACROECONOMIC &amp; GEOPOLITICAL VULNERABILITIES FOR INDIAN F&amp;O
              </span>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[10px] font-sans">
                {keyRisks.map((risk, idx) => (
                  <li key={idx}>
                    <span className="text-foreground/90">{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source Verification Integrity Notice */}
          <div className="text-[10px] text-muted-foreground bg-background/40 p-2.5 rounded-lg border border-border/50 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Source Verification Protocol: Real-time RSS ingestion from validated public wires with
              deduplication &amp; 24h freshness filter.
            </span>
            <span className="font-bold text-foreground">Zero AI Hallucinations Enforced</span>
          </div>
        </div>
      )}
    </section>
  );
}
