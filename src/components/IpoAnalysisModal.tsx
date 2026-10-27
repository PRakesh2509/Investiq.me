import { useState, useEffect } from "react";
import { type IPO } from "@/lib/ipos";
import { formatINR } from "@/lib/market-data";
import {
  saveAppliedIpo,
  removeAppliedIpo,
  getAppliedIpos,
  type AppliedIpoRecord,
} from "@/lib/applied-ipos";
import { X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { KeyTermsGrid } from "./ipos/modal/KeyTermsGrid";
import { ScheduleTimeline } from "./ipos/modal/ScheduleTimeline";
import { ScenariosSection } from "./ipos/modal/ScenariosSection";
import { LotCalculator } from "./ipos/modal/LotCalculator";
import { FactorBreakdown } from "./ipos/modal/FactorBreakdown";
import { FinancialsTable } from "./ipos/modal/FinancialsTable";
import { PeerComparison } from "./ipos/modal/PeerComparison";
import { StrengthsRisks } from "./ipos/modal/StrengthsRisks";
import { RegistrarFooter } from "./ipos/modal/RegistrarFooter";

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

  return <IpoAnalysisModalContent ipo={ipo} onClose={onClose} onAppliedChange={onAppliedChange} />;
}

function IpoAnalysisModalContent({
  ipo,
  onClose,
  onAppliedChange,
}: {
  ipo: IPO;
  onClose: () => void;
  onAppliedChange?: () => void;
}) {
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

  // Safe Lot Calculator calculations
  const totalShares = lots * (ipo.lotSize || 1);
  const totalInvestment = totalShares * (ipo.maxPrice || 0);
  const baseProfit = Math.round(totalShares * (ipo.gmp ?? 0));
  const upsideProfit = ipo.scenarios?.upside?.profitPerLot
    ? Math.round(lots * ipo.scenarios.upside.profitPerLot)
    : Math.round(totalShares * (ipo.gmp ? ipo.gmp * 1.35 : ipo.maxPrice * 0.12));
  const downsideProfit = ipo.scenarios?.downside?.profitPerLot
    ? Math.round(lots * ipo.scenarios.downside.profitPerLot)
    : Math.round(totalShares * (ipo.gmp ? ipo.gmp * 0.35 : -ipo.maxPrice * 0.06));

  const scenarios = ipo.scenarios || {
    downside: {
      price: Math.round(ipo.maxPrice * 0.94),
      gainPct: -6.0,
      profitPerLot: downsideProfit,
    },
    base: {
      price: Math.round(ipo.maxPrice + (ipo.gmp || 0)),
      gainPct: ipo.gmpPct || 0,
      profitPerLot: baseProfit,
    },
    upside: {
      price: Math.round(ipo.maxPrice + (ipo.gmp ? ipo.gmp * 1.35 : ipo.maxPrice * 0.15)),
      gainPct: ipo.gmpPct ? +(ipo.gmpPct * 1.35).toFixed(1) : 15,
      profitPerLot: upsideProfit,
    },
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${ipo.company} IPO analysis`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-hero p-5 sm:p-7 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close IPO analysis"
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
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${recColor}`}
                >
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

        <KeyTermsGrid ipo={ipo} />
        <ScheduleTimeline ipo={ipo} />
        <ScenariosSection scenarios={scenarios} />
        <LotCalculator
          ipo={ipo}
          lots={lots}
          setLots={setLots}
          totalShares={totalShares}
          totalInvestment={totalInvestment}
          baseProfit={baseProfit}
          upsideProfit={upsideProfit}
        />
        {ipo.factors && <FactorBreakdown aiScore={ipo.aiScore} factors={ipo.factors} />}
        {ipo.financials && ipo.financials.length > 0 && <FinancialsTable ipo={ipo} />}
        {ipo.peers && ipo.peers.length > 0 && <PeerComparison ipo={ipo} />}
        <StrengthsRisks ipo={ipo} />
        <RegistrarFooter ipo={ipo} />
      </div>
    </div>
  );
}
