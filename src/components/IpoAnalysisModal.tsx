import { useState, useMemo } from "react";
import { type IPO } from "@/lib/ipos";
import { formatINR } from "@/lib/market-data";
import {
  saveAppliedIpo,
  removeAppliedIpo,
  getAppliedIpos,
  type AppliedIpoRecord,
} from "@/lib/applied-ipos";
import {
  X,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Building2,
  FileSpreadsheet,
  Users,
  Percent,
  Plus,
  Minus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export function IpoAnalysisModal({
  ipo,
  isOpen,
  onClose,
  onAppliedChange,
}: {
  ipo: IPO | null;
  isOpen: boolean;
  onClose: () => void;
  onAppliedChange?: () => void;
}) {
  if (!isOpen || !ipo) return null;

  const appliedRecords = getAppliedIpos();
  const existingRecord = appliedRecords.find((r) => r.ipoId === ipo.id);
  const isApplied = Boolean(existingRecord);
  const [lots, setLots] = useState<number>(existingRecord?.lotsApplied || 1);

  // Sync lots when record exists
  useEffect(() => {
    if (existingRecord?.lotsApplied) {
      setLots(existingRecord.lotsApplied);
    }
  }, [existingRecord?.lotsApplied, ipo.id]);

  // Lot Calculator calculations
  const totalShares = lots * ipo.lotSize;
  const totalInvestment = totalShares * ipo.maxPrice;
  const baseProfit = Math.round(totalShares * (ipo.gmp ?? 0));
  const upsideProfit = Math.round(lots * ipo.scenarios.upside.profitPerLot);
  const downsideProfit = Math.round(lots * ipo.scenarios.downside.profitPerLot);

  const handleToggleApply = () => {
    if (isApplied && lots === existingRecord?.lotsApplied) {
      removeAppliedIpo(ipo.id);
      toast.info(`Removed ${ipo.company} from your Applied IPOs list.`);
    } else {
      const record: AppliedIpoRecord = {
        ipoId: ipo.id,
        company: ipo.company,
        symbol: ipo.symbol,
        category: ipo.category,
        price: ipo.maxPrice,
        lotSize: ipo.lotSize,
        lotsApplied: lots,
        totalInvestment,
        estimatedProfit: baseProfit,
        appliedDate: existingRecord?.appliedDate || new Date().toISOString().slice(0, 10),
        allotmentDate: ipo.allotmentDate,
        listingDate: ipo.listingDate,
        status: existingRecord?.status || "applied",
        registrar: ipo.registrar,
        allotmentUrl: ipo.allotmentUrl,
        gmp: ipo.gmp,
      };
      saveAppliedIpo(record);
      toast.success(
        isApplied
          ? `Updated ${ipo.company} to ${lots} lot${lots > 1 ? "s" : ""} (Est. profit: ₹${baseProfit.toLocaleString("en-IN")})!`
          : `Marked ${ipo.company} as Applied (${lots} lot${lots > 1 ? "s" : ""} · Est. profit: ₹${baseProfit.toLocaleString("en-IN")})!`,
      );
    }
    if (onAppliedChange) onAppliedChange();
  };

  const recColor =
    ipo.recommendation === "APPLY"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : ipo.recommendation === "AVOID"
      ? "border-red-500/40 bg-red-500/10 text-red-400"
      : "border-amber-500/40 bg-amber-500/10 text-amber-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-hero p-5 sm:p-7 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/60 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 1. Header & Verdict Banner */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                  ipo.category === "SME"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                }`}
              >
                {ipo.category} IPO
              </span>
              <span className="rounded bg-surface/80 px-2 py-0.5 text-[10px] text-muted-foreground border border-border">
                {ipo.exchange}
              </span>
              <span className="text-xs text-muted-foreground">NSE Symbol: {ipo.symbol}</span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold">{ipo.company}</h2>
            <p className="text-xs text-muted-foreground">{ipo.sector}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${recColor}`}>
                  {ipo.recommendation}
                </span>
                <span className="font-display text-2xl font-black text-primary">
                  {ipo.aiScore}
                  <span className="text-xs font-normal text-muted-foreground">/100</span>
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                AI Confidence: <span className="text-foreground font-medium">{ipo.confidence}</span>
              </p>
            </div>

            <button
              onClick={handleToggleApply}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                isApplied
                  ? lots !== existingRecord?.lotsApplied
                    ? "border-primary bg-primary text-black font-bold shadow-glow"
                    : "border-emerald-500/50 bg-emerald-500/20 text-emerald-400 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/40"
                  : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isApplied
                ? lots !== existingRecord?.lotsApplied
                  ? `Update to ${lots} Lot${lots > 1 ? "s" : ""}`
                  : `Applied (${existingRecord?.lotsApplied || lots} Lot${(existingRecord?.lotsApplied || lots) > 1 ? "s" : ""}) ✓`
                : `Apply (${lots} Lot${lots > 1 ? "s" : ""})`}
            </button>
          </div>
        </div>

        {/* 2. Key Terms Summary Grid */}
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
              QIB: {ipo.subscription.qib ? `${ipo.subscription.qib}x` : "—"} · Retail: {ipo.subscription.retail ? `${ipo.subscription.retail}x` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/50 p-3">
            <p className="text-muted-foreground">Current GMP</p>
            <p className="mt-1 font-semibold text-emerald-400 text-sm">
              {ipo.gmp ? `+₹${ipo.gmp} (+${ipo.gmpPct?.toFixed(1)}%)` : "Unavailable"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Est. ₹{ipo.estListingPrice || "—"}</p>
          </div>
        </div>

        {/* 3. Dates Timeline */}
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

        {/* 4. Listing Gain Scenarios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Listing Price Scenarios &amp; Estimated Gain
            </h3>
            <span className="text-[10px] text-muted-foreground">
              Formula: ((Est. Price - Issue Price) / Issue Price) × 100
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Downside Scenario</span>
                <span className="text-xs font-semibold text-destructive">
                  {ipo.scenarios.downside.gainPct >= 0 ? "+" : ""}
                  {ipo.scenarios.downside.gainPct}%
                </span>
              </div>
              <p className="mt-1 font-display text-lg font-bold">₹{ipo.scenarios.downside.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Est. Return: {formatINR(ipo.scenarios.downside.profitPerLot)} / lot
              </p>
            </div>

            <div className="rounded-xl border border-primary/40 bg-primary/10 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-primary font-medium">Base Case (GMP)</span>
                <span className="text-xs font-semibold text-primary">
                  +{ipo.scenarios.base.gainPct}%
                </span>
              </div>
              <p className="mt-1 font-display text-lg font-bold text-primary">₹{ipo.scenarios.base.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Est. Profit: <span className="font-medium text-foreground">{formatINR(ipo.scenarios.base.profitPerLot)}</span> / lot
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-medium">Upside Scenario</span>
                <span className="text-xs font-semibold text-emerald-400">
                  +{ipo.scenarios.upside.gainPct}%
                </span>
              </div>
              <p className="mt-1 font-display text-lg font-bold text-emerald-400">₹{ipo.scenarios.upside.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Est. Profit: <span className="font-medium text-emerald-400">+{formatINR(ipo.scenarios.upside.profitPerLot)}</span> / lot
              </p>
            </div>
          </div>
        </div>

        {/* 5. Interactive Lot Profitability Calculator */}
        <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Lot Profitability Calculator</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Lots:</span>
              <button
                onClick={() => setLots((l) => Math.max(1, l - 1))}
                className="grid h-6 w-6 place-items-center rounded bg-background border border-border text-xs hover:bg-accent"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="font-bold text-sm min-w-[24px] text-center">{lots}</span>
              <button
                onClick={() => setLots((l) => l + 1)}
                className="grid h-6 w-6 place-items-center rounded bg-background border border-border text-xs hover:bg-accent"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-muted-foreground">Total Shares</p>
              <p className="mt-1 font-bold text-sm">{totalShares.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-muted-foreground">{lots} Lot × {ipo.lotSize} sh</p>
            </div>
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-muted-foreground">Capital Required</p>
              <p className="mt-1 font-bold text-sm text-foreground">{formatINR(totalInvestment)}</p>
              <p className="text-[10px] text-muted-foreground">At Cut-off ₹{ipo.maxPrice}</p>
            </div>
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-muted-foreground">Expected Profit (Base)</p>
              <p className="mt-1 font-bold text-sm text-emerald-400">+{formatINR(baseProfit)}</p>
              <p className="text-[10px] text-muted-foreground">At Current GMP</p>
            </div>
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-muted-foreground">Upside Profit</p>
              <p className="mt-1 font-bold text-sm text-emerald-400">+{formatINR(upsideProfit)}</p>
              <p className="text-[10px] text-muted-foreground">At Momentum High</p>
            </div>
          </div>
        </div>

        {/* 6. Five-Factor AI Score Breakdown */}
        <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              5-Factor Institutional Score Breakdown
            </h3>
            <span className="text-xs text-muted-foreground">Weighted Composite: {ipo.aiScore}/100</span>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            {[
              { key: "demand", name: "A. Subscription Demand", weight: "30%", ...ipo.factors.demand },
              { key: "financials", name: "B. Financial Quality", weight: "25%", ...ipo.factors.financials },
              { key: "valuation", name: "C. Valuation & Peer Pricing", weight: "20%", ...ipo.factors.valuation },
              { key: "gmp", name: "D. GMP & Grey Market Sentiment", weight: "15%", ...ipo.factors.gmp },
              { key: "structure", name: "E. Issue Structure & Capital Use", weight: "10%", ...ipo.factors.structure },
            ].map((f) => (
              <div key={f.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{f.name} <span className="text-[10px] text-muted-foreground">({f.weight})</span></span>
                  <span className="font-bold">{f.score}/100</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-background overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      f.score >= 75 ? "bg-emerald-400" : f.score >= 55 ? "bg-amber-400" : "bg-red-400"
                    }`}
                    style={{ width: `${f.score}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{f.rationale}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 7. Financial Statements (3-Year History) */}
        {ipo.financials && ipo.financials.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Reported Financial Performance (3-Year Trend)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/80 text-muted-foreground">
                    <th className="py-2">Period</th>
                    <th className="py-2">Revenue (₹ Cr)</th>
                    <th className="py-2">PAT (₹ Cr)</th>
                    <th className="py-2">EBITDA %</th>
                    <th className="py-2">RoE %</th>
                    <th className="py-2">Debt/Equity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {ipo.financials.map((row) => (
                    <tr key={row.fy}>
                      <td className="py-2 font-semibold text-foreground">{row.fy}</td>
                      <td className="py-2">₹{row.revenueCr.toLocaleString("en-IN")} Cr</td>
                      <td className="py-2 font-medium text-emerald-400">₹{row.patCr.toLocaleString("en-IN")} Cr</td>
                      <td className="py-2">{row.ebitdaMarginPct ? `${row.ebitdaMarginPct}%` : "—"}</td>
                      <td className="py-2">{row.roePct ? `${row.roePct}%` : "—"}</td>
                      <td className="py-2">{row.debtToEquity !== undefined ? row.debtToEquity.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. Listed Peer Comparison */}
        {ipo.peers && ipo.peers.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              Listed Peer Comparison
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/80 text-muted-foreground">
                    <th className="py-2">Company</th>
                    <th className="py-2">P/E Multiple</th>
                    <th className="py-2">Revenue (₹ Cr)</th>
                    <th className="py-2">PAT (₹ Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr className="bg-primary/5 font-semibold text-primary">
                    <td className="py-2">{ipo.company} (IPO)</td>
                    <td className="py-2">{ipo.postIssuePe ? `${ipo.postIssuePe}x` : "—"}</td>
                    <td className="py-2">
                      ₹{ipo.financials?.[ipo.financials.length - 1]?.revenueCr || "—"} Cr
                    </td>
                    <td className="py-2">
                      ₹{ipo.financials?.[ipo.financials.length - 1]?.patCr || "—"} Cr
                    </td>
                  </tr>
                  {ipo.peers.map((peer) => (
                    <tr key={peer.name}>
                      <td className="py-2 text-foreground">{peer.name}</td>
                      <td className="py-2 font-medium">{peer.pe ? `${peer.pe}x` : "—"}</td>
                      <td className="py-2 text-muted-foreground">₹{peer.revenueCr} Cr</td>
                      <td className="py-2 text-muted-foreground">₹{peer.patCr} Cr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. Strengths vs Key Risks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
            <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Bullish Arguments &amp; Competitive Moats
            </h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {ipo.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-400">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <h4 className="text-xs font-semibold text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Bearish Concerns &amp; Key Risks
            </h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {ipo.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-destructive">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 10. Use of Proceeds & Registrar Verification */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
          <div>
            <p className="text-muted-foreground">Official Allotment Registrar:</p>
            <p className="font-semibold text-foreground">{ipo.registrar}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={ipo.allotmentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
            >
              Check Allotment on Registrar <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
