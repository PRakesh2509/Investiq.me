import type { IPO } from "@/lib/ipos";

export function ScheduleTimeline({ ipo }: { ipo: IPO }) {
  return (
    <>
      <div className="rounded-xl border border-border bg-surface/40 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Official Bidding &amp; Allotment Schedule
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Issue Opens</p>
            <p className="font-semibold text-foreground mt-0.5">{ipo.openDate || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Issue Closes</p>
            <p className="font-semibold text-foreground mt-0.5">{ipo.closeDate || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Allotment Date</p>
            <p className="font-semibold text-foreground mt-0.5">{ipo.allotmentDate || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Listing Date</p>
            <p className="font-semibold text-emerald-400 mt-0.5">{ipo.listingDate || "—"}</p>
          </div>
        </div>
      </div>
    </>
  );
}
