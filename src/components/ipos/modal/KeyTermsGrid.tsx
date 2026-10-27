import type { IPO } from "@/lib/ipos";
import { formatINR } from "@/lib/market-data";

export function KeyTermsGrid({ ipo }: { ipo: IPO }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-muted-foreground">Price Band</p>
          <p className="mt-1 font-semibold text-foreground text-sm">{ipo.priceBand}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Cap: ₹{ipo.maxPrice}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-muted-foreground">Lot Size</p>
          <p className="mt-1 font-semibold text-foreground text-sm">{ipo.lotSize} Shares</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Min 1 Lot</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-muted-foreground">Min Investment</p>
          <p className="mt-1 font-semibold text-primary text-sm">{formatINR(ipo.minInvestment)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Retail Application</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-muted-foreground">Issue Size</p>
          <p className="mt-1 font-semibold text-foreground text-sm">{ipo.issueSize}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Fresh: {ipo.freshIssue}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-muted-foreground">Subscription Status</p>
          <p className="mt-1 font-semibold text-emerald-400 text-sm">
            {ipo.subscription.total ? `${ipo.subscription.total}x` : "Awaiting"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            QIB: {ipo.subscription.qib ? `${ipo.subscription.qib}x` : "—"} · Retail:{" "}
            {ipo.subscription.retail ? `${ipo.subscription.retail}x` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-muted-foreground">Current GMP</p>
          <p className="mt-1 font-semibold text-emerald-400 text-sm">
            {ipo.gmp ? `+₹${ipo.gmp} (+${ipo.gmpPct?.toFixed(1)}%)` : "Unavailable"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Est. ₹{ipo.estListingPrice || "—"}
          </p>
        </div>
      </div>
    </>
  );
}
