import { useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw, X, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const initial = {
  name: "",
  existingQty: "",
  currentAvg: "",
  newQty: "",
  currentPrice: "",
  marketPrice: "",
};

type Mode = "stock" | "mf";

export default function AvgPriceCalculator({ open, onClose }: Props) {
  const [f, setF] = useState(initial);
  const [mode, setMode] = useState<Mode>("stock");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isMf = mode === "mf";
  const L = isMf
    ? {
        name: "Fund Name (optional)",
        namePh: "e.g. NIFTY 50 INDEX FUND",
        existing: "Existing Units",
        existingPh: "50",
        avg: "Existing Avg NAV ₹",
        avgPh: "175.00",
        newQty: "New Units Buying",
        newQtyPh: "30",
        price: "New Purchase NAV ₹",
        pricePh: "168.00",
        market: "Current NAV ₹ (optional)",
        marketPh: "176.50",
        avgResult: "New Average NAV",
        totalLabel: "Total Units",
        unitSuffix: "units",
      }
    : {
        name: "Share Name (optional)",
        namePh: "e.g. RELIANCE",
        existing: "Existing Qty",
        existingPh: "100",
        avg: "Current Avg ₹",
        avgPh: "2500.00",
        newQty: "New Qty Buying",
        newQtyPh: "50",
        price: "Current Price ₹",
        pricePh: "2300.00",
        market: "Current Market Price ₹ (optional)",
        marketPh: "2450.00",
        avgResult: "New Average Price",
        totalLabel: "Total Shares",
        unitSuffix: "shares",
      };

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  const parsed = useMemo(() => ({
    eq: num(f.existingQty),
    ca: num(f.currentAvg),
    nq: num(f.newQty),
    cp: num(f.currentPrice),
    mp: num(f.marketPrice),
  }), [f]);

  const ready = [parsed.eq, parsed.ca, parsed.nq, parsed.cp].every((v) => !Number.isNaN(v));
  const totalUnits = ready ? parsed.eq + parsed.nq : 0;
  const newAvg = ready && totalUnits > 0
    ? (parsed.eq * parsed.ca + parsed.nq * parsed.cp) / totalUnits
    : 0;
  const totalCost = ready ? totalUnits * newAvg : 0;
  const netChange = ready ? parsed.nq * parsed.cp - parsed.nq * parsed.ca : 0;
  const hasMp = !Number.isNaN(parsed.mp);
  const pl = ready && hasMp ? parsed.mp * totalUnits - totalCost : 0;
  const plPct = ready && hasMp && totalCost > 0 ? (pl / totalCost) * 100 : 0;

  const inr = (n: number, d = 2) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

  if (!open) return null;

  const update = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const Field = ({
    label, value, onChange, placeholder, type = "number", step,
  }: {
    label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string; type?: string; step?: string;
  }) => {
    const invalid = type === "number" && value !== "" && Number.isNaN(num(value));
    return (
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <input
          type={type}
          step={step}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none transition focus:border-primary ${
            invalid ? "border-destructive" : "border-border"
          }`}
        />
      </label>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-primary/20 bg-background shadow-elegant"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border bg-surface/60 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold">Avg Price Calculator</h2>
              <p className="text-xs text-muted-foreground">Plan your averaging trade</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setF(initial)}
              title="Reset"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 border-b border-border bg-surface/40 px-5 py-3">
          {(["stock", "mf"] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                  active
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "bg-background/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "stock" ? "Stock Avg" : "MF Avg"}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-5">
          <Field label={L.name} value={f.name} onChange={update("name")} placeholder={L.namePh} type="text" />

          <div className="grid grid-cols-2 gap-3">
            <Field label={L.existing} value={f.existingQty} onChange={update("existingQty")} placeholder={L.existingPh} step="0.0001" />
            <Field label={L.avg} value={f.currentAvg} onChange={update("currentAvg")} placeholder={L.avgPh} step="0.0001" />
            <Field label={L.newQty} value={f.newQty} onChange={update("newQty")} placeholder={L.newQtyPh} step="0.0001" />
            <Field label={L.price} value={f.currentPrice} onChange={update("currentPrice")} placeholder={L.pricePh} step="0.0001" />
          </div>


          {/* Results */}
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
            {f.name && (
              <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                For <span className="font-semibold text-foreground">{f.name}</span>
              </p>
            )}
            {ready ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">{L.avgResult}</span>
                  <span className="font-display text-2xl font-bold tabular-nums text-primary">{inr(newAvg, isMf ? 4 : 2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                  <Row label={L.totalLabel} value={`${totalUnits.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${L.unitSuffix}`} />
                  <Row label="Total Cost Basis" value={inr(totalCost)} />
                  <Row
                    label="Net Additional Cost"
                    value={(netChange >= 0 ? "+" : "−") + inr(Math.abs(netChange))}
                    color={netChange <= 0 ? "text-success" : "text-destructive"}
                  />
                  <Row
                    label={isMf ? "NAV Change" : "Avg Change"}
                    value={(newAvg - parsed.ca >= 0 ? "+" : "") + (newAvg - parsed.ca).toFixed(isMf ? 4 : 2)}
                    color={newAvg - parsed.ca < 0 ? "text-success" : "text-destructive"}
                  />
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">Fill all four fields to see results</p>
            )}
          </div>

          {/* Optional P&L */}
          <div className="rounded-xl border border-border bg-surface/40 p-4">
            <Field
              label={L.market}
              value={f.marketPrice}
              onChange={update("marketPrice")}
              placeholder={L.marketPh}
              step="0.0001"
            />

            {ready && hasMp && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                <Row label="Portfolio Value" value={inr(parsed.mp * totalUnits)} />
                <Row
                  label="Unrealized P&L"
                  value={(pl >= 0 ? "+" : "−") + inr(Math.abs(pl))}
                  color={pl >= 0 ? "text-success" : "text-destructive"}
                />
                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">P&L %</span>
                  <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${pl >= 0 ? "text-success" : "text-destructive"}`}>
                    {pl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {plPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface/40 px-5 py-3">
          <p className="text-center text-[11px] text-muted-foreground">Educational tool. Not investment advice.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
