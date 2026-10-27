import { BellRing, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { Underlying, View } from "./shared";

export function ChainControls(p: {
  canSend: boolean;
  query: string;
  setQuery: (v: string) => void;
  expiry: string;
  setExpiry: (v: string) => void;
  expiries: string[];
  loading: boolean;
  onRefresh: () => void;
  underlyings: Underlying[];
  selected: Underlying | null;
  setSelected: (u: Underlying) => void;
  view: View;
  setView: (v: View) => void;
  range: number;
  setRange: (v: number) => void;
  minVolume: number;
  setMinVolume: (v: number) => void;
  minOi: number;
  setMinOi: (v: number) => void;
  autoAlerts: boolean;
  setAutoAlerts: (fn: (a: boolean) => boolean) => void;
}) {
  const {
    query,
    setQuery,
    expiry,
    setExpiry,
    expiries,
    loading,
    onRefresh,
    underlyings,
    selected,
    setSelected,
    view,
    setView,
    range,
    setRange,
    minVolume,
    setMinVolume,
    minOi,
    setMinOi,
    autoAlerts,
    setAutoAlerts,
  } = p;
  return (
    <>
      {/* Controls */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Search underlying
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="NIFTY, BANKNIFTY, RELIANCE…"
              className="h-10 w-full rounded-lg border border-border bg-surface/60 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Expiry
          </label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            disabled={!expiries.length}
            className="mt-1 h-10 rounded-lg border border-border bg-surface/60 px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
          >
            {expiries.length === 0 && <option value="">—</option>}
            {expiries.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => onRefresh()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface/60 px-4 text-xs hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Underlying chips */}
      <div className="flex flex-wrap gap-2">
        {underlyings.map((u) => (
          <button
            key={u.key}
            onClick={() => setSelected(u)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              selected?.key === u.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface/40 p-3">
        <Field label="Option type">
          <div className="inline-flex rounded-lg border border-border bg-background/60 p-0.5">
            {(["both", "CE", "PE"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  v === view
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "both" ? "Both" : v}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Strikes around ATM">
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
          >
            {[5, 10, 15, 20, 0].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "All strikes" : `± ${v}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Min volume">
          <input
            type="number"
            min={0}
            step={1000}
            value={minVolume}
            onChange={(e) => setMinVolume(Math.max(0, Number(e.target.value)))}
            className="h-8 w-28 rounded-lg border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
          />
        </Field>
        <Field label="Min open interest">
          <input
            type="number"
            min={0}
            step={10000}
            value={minOi}
            onChange={(e) => setMinOi(Math.max(0, Number(e.target.value)))}
            className="h-8 w-28 rounded-lg border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
          />
        </Field>
        <button
          onClick={() => setAutoAlerts((a) => !a)}
          disabled={!p.canSend}
          title={p.canSend ? undefined : "Admin login required"}
          className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition ${
            autoAlerts
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <BellRing className={`h-3.5 w-3.5 ${autoAlerts ? "animate-pulse" : ""}`} />
          Telegram alerts {autoAlerts ? "ON" : "OFF"}
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
