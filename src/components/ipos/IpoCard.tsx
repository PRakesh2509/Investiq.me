import { CheckCircle2, ChevronRight, ExternalLink, TrendingUp } from "lucide-react";
import { ipoStatusLabel, type IPO } from "@/lib/ipos";
import type { AppliedIpoRecord } from "@/lib/applied-ipos";
import { formatINR } from "@/lib/market-data";
import { fmtDate } from "./format";

export function IpoCard({
  ipo,
  appliedRecord,
  onOpenAnalysis,
  onOpenTrack,
  onAppliedChange,
}: {
  ipo: IPO;
  appliedRecord?: AppliedIpoRecord;
  onOpenAnalysis: () => void;
  onOpenTrack: () => void;
  onAppliedChange: () => void;
}) {
  const isApplied = Boolean(appliedRecord);
  const lotsApplied = appliedRecord?.lotsApplied || 1;

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
            <span className="font-mono text-[11px] font-bold text-primary">{ipo.symbol}</span>
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
          <p className="text-[10px] text-muted-foreground">Est: ₹{ipo.estListingPrice || "—"}</p>
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
            <span className="font-semibold text-primary">+{ipo.scenarios.base.gainPct}%</span>
            <span className="block text-[10px] text-foreground font-medium">
              +{formatINR(ipo.scenarios.base.profitPerLot)}
            </span>
          </div>

          <div className="rounded-lg bg-emerald-500/10 p-1 border border-emerald-500/30">
            <span className="text-[10px] text-emerald-400 block font-medium">Upside</span>
            <span className="font-semibold text-emerald-400">+{ipo.scenarios.upside.gainPct}%</span>
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
          onClick={(e) => {
            e.stopPropagation();
            onOpenTrack();
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            isApplied
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
              : "border-border bg-background/80 text-muted-foreground hover:text-foreground hover:bg-surface"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isApplied
            ? `Applied (${lotsApplied} Lot${lotsApplied > 1 ? "s" : ""}) ✓`
            : "Track Application"}
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
