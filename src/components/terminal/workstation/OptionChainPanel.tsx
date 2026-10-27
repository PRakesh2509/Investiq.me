import { RefreshCw } from "lucide-react";
import type { InstrumentConfig, WorkstationData } from "./types";

export function OptionChainPanel({
  data,
  cfg,
  instrument,
  curSymbol,
  isRefreshing,
  onRefresh,
  onSelectStrike,
}: {
  data: WorkstationData;
  cfg: InstrumentConfig;
  instrument: string;
  curSymbol: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectStrike: (strike: number, type: "CE" | "PE", ltp: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
            LIVE OPTION CHAIN ({instrument}) — STRIKES &amp; PREMIUMS
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-[11px] font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            REFRESH QUOTES
          </button>
          <span className="font-mono text-[11px] text-muted-foreground">
            Step: {cfg.step} pts · Lot Size: {cfg.lotSize} Qty
          </span>
        </div>
      </div>

      {/* Option Chain Table */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-center font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground bg-background/50">
              <th className="py-2.5 px-3 text-left">CALL LTP ({curSymbol})</th>
              <th className="py-2.5 px-3">CALL TYPE</th>
              <th className="py-2.5 px-3 font-bold text-foreground">STRIKE PRICE</th>
              <th className="py-2.5 px-3">PUT TYPE</th>
              <th className="py-2.5 px-3 text-right">PUT LTP ({curSymbol})</th>
              <th className="py-2.5 px-3 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {(data.strikes ?? []).map((row) => (
              <tr key={row.strike} className="hover:bg-accent/30 transition">
                <td className="py-2.5 px-3 text-left font-bold text-emerald-400">
                  {curSymbol}
                  {row.callLtp.toFixed(2)}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      row.callType === "ITM"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : row.callType === "ATM"
                          ? "bg-primary text-primary-foreground shadow-glow"
                          : "bg-surface text-muted-foreground border border-border"
                    }`}
                  >
                    {row.callType}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-bold text-foreground text-sm">
                  {row.strike} {row.callType === "ATM" || row.putType === "ATM" ? "(ATM)" : ""}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      row.putType === "ITM"
                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        : row.putType === "ATM"
                          ? "bg-primary text-primary-foreground shadow-glow"
                          : "bg-surface text-muted-foreground border border-border"
                    }`}
                  >
                    {row.putType}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                  {curSymbol}
                  {row.putLtp.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button
                      onClick={() => onSelectStrike(row.strike, "CE", row.callLtp)}
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
                    >
                      CALC CE
                    </button>
                    <button
                      onClick={() => onSelectStrike(row.strike, "PE", row.putLtp)}
                      className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400 hover:bg-rose-500/20 transition"
                    >
                      CALC PE
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
