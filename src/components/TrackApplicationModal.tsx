import { useState, useEffect, useMemo } from "react";
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
  Plus,
  Minus,
  TrendingUp,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

export function TrackApplicationModal({
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

  return (
    <TrackApplicationModalContent
      ipo={ipo}
      onClose={onClose}
      onAppliedChange={onAppliedChange}
    />
  );
}

function TrackApplicationModalContent({
  ipo,
  onClose,
  onAppliedChange,
}: {
  ipo: IPO;
  onClose: () => void;
  onAppliedChange?: () => void;
}) {
  const appliedRecords = getAppliedIpos();
  const existing = appliedRecords.find((r) => r.ipoId === ipo.id);
  const isAlreadyApplied = Boolean(existing);

  const [lots, setLots] = useState<number>(existing?.lotsApplied || 1);

  // Keep lots in sync when opening for different IPO or existing record
  useEffect(() => {
    if (existing?.lotsApplied) {
      setLots(existing.lotsApplied);
    } else {
      setLots(1);
    }
  }, [ipo.id, existing?.lotsApplied]);

  // Derived financial calculations
  const totalShares = lots * (ipo.lotSize || 1);
  const totalInvestment = totalShares * (ipo.maxPrice || 0);
  const gmpPerShare = ipo.gmp ?? 0;
  const baseEstimatedProfit = Math.round(totalShares * gmpPerShare);
  const gainPct = ipo.gmpPct ?? 0;

  const upsideProfit = ipo.scenarios?.upside?.profitPerLot
    ? Math.round(lots * ipo.scenarios.upside.profitPerLot)
    : Math.round(totalShares * (gmpPerShare > 0 ? gmpPerShare * 1.35 : ipo.maxPrice * 0.12));

  const downsideProfit = ipo.scenarios?.downside?.profitPerLot
    ? Math.round(lots * ipo.scenarios.downside.profitPerLot)
    : Math.round(totalShares * (gmpPerShare > 0 ? gmpPerShare * 0.35 : -ipo.maxPrice * 0.06));

  const upsideGainPct =
    ipo.scenarios?.upside?.gainPct ?? (gainPct > 0 ? +(gainPct * 1.35).toFixed(1) : 12);
  const downsideGainPct =
    ipo.scenarios?.downside?.gainPct ?? (gainPct > 0 ? +(gainPct * 0.35).toFixed(1) : -6);

  // Preset lot options based on Category
  const presets = useMemo(() => {
    if (ipo.category === "SME") {
      return [
        { label: "1 Lot (Retail)", lots: 1 },
        { label: "2 Lots (HNI)", lots: 2 },
        { label: "4 Lots (HNI)", lots: 4 },
      ];
    }
    // Mainboard
    const lotCost = (ipo.lotSize || 1) * (ipo.maxPrice || 1);
    const sNiiLots = Math.max(2, Math.ceil(200_000 / lotCost));
    const bNiiLots = Math.max(sNiiLots + 1, Math.ceil(1_000_000 / lotCost));

    return [
      { label: "1 Lot (Retail)", lots: 1 },
      { label: "2 Lots", lots: 2 },
      { label: `${sNiiLots} Lots (sNII >₹2L)`, lots: sNiiLots },
      { label: `${bNiiLots} Lots (bNII >₹10L)`, lots: bNiiLots },
    ];
  }, [ipo]);

  const handleConfirm = () => {
    if (lots < 1) {
      toast.error("Please select at least 1 lot");
      return;
    }

    const record: AppliedIpoRecord = {
      ipoId: ipo.id,
      company: ipo.company,
      symbol: ipo.symbol,
      category: ipo.category,
      price: ipo.maxPrice,
      lotSize: ipo.lotSize,
      lotsApplied: lots,
      totalInvestment,
      estimatedProfit: baseEstimatedProfit,
      appliedDate: existing?.appliedDate || new Date().toISOString().slice(0, 10),
      allotmentDate: ipo.allotmentDate,
      listingDate: ipo.listingDate,
      status: existing?.status || "applied",
      registrar: ipo.registrar,
      allotmentUrl: ipo.allotmentUrl,
      gmp: ipo.gmp,
    };

    saveAppliedIpo(record);
    toast.success(
      isAlreadyApplied
        ? `Updated ${ipo.company} to ${lots} lot${lots > 1 ? "s" : ""}!`
        : `Tracked ${ipo.company} application (${lots} lot${lots > 1 ? "s" : ""})!`,
    );

    if (onAppliedChange) onAppliedChange();
    onClose();
  };

  const handleRemove = () => {
    removeAppliedIpo(ipo.id);
    toast.info(`Removed ${ipo.company} from applied tracker`);
    if (onAppliedChange) onAppliedChange();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-hero p-5 sm:p-6 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/60 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="border-b border-border/80 pb-4">
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
            <span className="font-mono text-xs font-bold text-primary">{ipo.symbol}</span>
            <span className="text-xs text-muted-foreground">· Cut-off ₹{ipo.maxPrice}</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold">{ipo.company}</h2>
          <p className="text-xs text-muted-foreground">
            Configure application lots to calculate capital required and estimated listing profit.
          </p>
        </div>

        {/* Lots Selector Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Number of Lots
            </label>
            <span className="text-xs text-muted-foreground">
              {ipo.lotSize} shares per lot
            </span>
          </div>

          {/* Stepper Input */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface/80 p-2">
            <button
              onClick={() => setLots((prev) => Math.max(1, prev - 1))}
              disabled={lots <= 1}
              className="grid h-10 w-10 place-items-center rounded-lg bg-background border border-border text-foreground hover:bg-accent disabled:opacity-40 transition"
            >
              <Minus className="h-4 w-4" />
            </button>

            <div className="text-center">
              <input
                type="number"
                min={1}
                max={500}
                value={lots}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setLots(Number.isNaN(val) ? 1 : Math.max(1, val));
                }}
                className="w-20 text-center font-display text-2xl font-bold bg-transparent border-none text-foreground focus:outline-none"
              />
              <span className="block text-[11px] text-muted-foreground -mt-1">
                {totalShares.toLocaleString("en-IN")} Total Shares
              </span>
            </div>

            <button
              onClick={() => setLots((prev) => prev + 1)}
              className="grid h-10 w-10 place-items-center rounded-lg bg-background border border-border text-foreground hover:bg-accent transition"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Presets Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {presets.map((p) => {
              const active = lots === p.lots;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setLots(p.lots)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? "border-primary bg-primary/20 text-primary font-bold"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-surface"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Calculation Cards */}
        <div className="space-y-3 pt-1">
          {/* Estimated Profit at GMP (Primary Highlight) */}
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" />
                Estimated Profit (Current GMP)
              </span>
              <span className="text-xs font-bold text-emerald-400">
                {gainPct >= 0 ? "+" : ""}
                {gainPct.toFixed(1)}% Return
              </span>
            </div>

            <p className="font-display text-2xl font-black text-emerald-400">
              {baseEstimatedProfit >= 0 ? "+" : ""}
              {formatINR(baseEstimatedProfit)}
            </p>

            <p className="text-[11px] text-muted-foreground">
              Based on {lots} lot{lots > 1 ? "s" : ""} ({totalShares} shares) × ₹{gmpPerShare} current GMP premium.
            </p>
          </div>

          {/* Capital Required & Scenario Details */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-xl border border-border bg-surface/60 p-3">
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Capital Required</span>
              <p className="mt-0.5 font-display text-base font-bold text-foreground">
                {formatINR(totalInvestment)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Blocked via UPI / ASBA
              </p>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <span className="text-[10px] text-primary uppercase font-medium">Upside Momentum</span>
              <p className="mt-0.5 font-display text-base font-bold text-primary">
                +{formatINR(upsideProfit)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                At +{upsideGainPct}% gain
              </p>
            </div>
          </div>

          {/* Downside Scenario Disclaimer */}
          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-[11px] text-muted-foreground">
            <span>Downside Buffer ({downsideGainPct}%):</span>
            <span className={downsideProfit >= 0 ? "text-muted-foreground" : "text-destructive font-medium"}>
              {formatINR(downsideProfit)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 border-t border-border/80 pt-4">
          {isAlreadyApplied ? (
            <button
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove Tracking
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition"
            >
              Cancel
            </button>
          )}

          <button
            onClick={handleConfirm}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-5 py-2.5 text-xs font-bold text-black shadow-glow hover:opacity-90 transition"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isAlreadyApplied
              ? `Update to ${lots} Lot${lots > 1 ? "s" : ""}`
              : `Confirm & Track ${lots} Lot${lots > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
