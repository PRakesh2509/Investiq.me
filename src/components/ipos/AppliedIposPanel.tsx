import { Briefcase, Calculator, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { IPO } from "@/lib/ipos";
import {
  removeAppliedIpo,
  updateAppliedIpoStatus,
  type AppliedIpoRecord,
} from "@/lib/applied-ipos";
import { formatINR } from "@/lib/market-data";
import { fmtDate } from "./format";

export function AppliedIposPanel({
  appliedList,
  allIpos,
  onAppliedChange,
  onOpenTrack,
  onOpenAnalysis,
  onGoToOpen,
}: {
  appliedList: AppliedIpoRecord[];
  allIpos: IPO[];
  onAppliedChange: () => void;
  onOpenTrack: (ipo: IPO) => void;
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

  const handleStatusChange = (ipoId: string, status: AppliedIpoRecord["status"]) => {
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
            Keep track of all your IPO bids, application amounts, lot sizes, blocked UPI funds, and
            allotment results in one place.
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
          <p className="text-[10px] uppercase font-medium text-muted-foreground">
            Total Capital Blocked
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {formatINR(totalCapital)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Across {appliedList.length} applications
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">Lots Applied</p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">{totalLots} Lots</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Total bidding exposure</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">Est. GMP Profit</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-400">
            +{formatINR(potentialProfit)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">At current grey market premium</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <p className="text-[10px] uppercase font-medium text-muted-foreground">
            Allotment Status
          </p>
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

            const ipoMatch = allIpos.find(
              (i) =>
                i.id === record.ipoId || i.symbol.toUpperCase() === record.symbol.toUpperCase(),
            );
            const estProfit = Math.round((record.gmp ?? 0) * record.lotSize * record.lotsApplied);

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
                    <span className="font-mono text-xs font-bold text-primary">
                      {record.symbol}
                    </span>
                    <h4 className="font-display text-base font-bold text-foreground truncate">
                      {record.company}
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      Lots: <strong className="text-foreground">{record.lotsApplied}</strong> (
                      {record.lotsApplied * record.lotSize} Shares)
                      {ipoMatch && (
                        <button
                          onClick={() => onOpenTrack(ipoMatch)}
                          className="ml-1 rounded bg-primary/10 border border-primary/30 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition"
                        >
                          Change Lots
                        </button>
                      )}
                    </span>
                    <span>•</span>
                    <span>
                      Capital:{" "}
                      <strong className="text-foreground">
                        {formatINR(record.totalInvestment)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Est. Profit (GMP):{" "}
                      <strong className="text-emerald-400 font-bold">
                        +{formatINR(estProfit)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Cut-off Price: <strong className="text-foreground">₹{record.price}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Allotment Date:{" "}
                      <strong className="text-foreground">{fmtDate(record.allotmentDate)}</strong>
                    </span>
                  </div>
                </div>

                {/* Status Selector & Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                      Status
                    </span>
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
                      <option value="applied" className="bg-hero text-blue-400">
                        Applied (Blocked)
                      </option>
                      <option value="allotted" className="bg-hero text-emerald-400">
                        Allotted 🎉
                      </option>
                      <option value="not_allotted" className="bg-hero text-red-400">
                        Not Allotted
                      </option>
                    </select>
                  </div>

                  {ipoMatch && (
                    <button
                      onClick={() => onOpenTrack(ipoMatch)}
                      className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                      title="Adjust lots and see updated profit"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      Lots
                    </button>
                  )}

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
