import { RefreshCw, TrendingUp, TrendingDown, Target, Award } from "lucide-react";
import type { InstrumentConfig, WorkstationData } from "./types";

export function OptionChainPanel({
  data,
  cfg,
  instrument,
  curSymbol,
  isRefreshing,
  onRefresh,
  onSelectStrike,
  onSelectExpiry,
}: {
  data: WorkstationData;
  cfg: InstrumentConfig;
  instrument: string;
  curSymbol: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectStrike: (strike: number, type: "CE" | "PE", ltp: number) => void;
  onSelectExpiry?: (exp: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur">
      {/* Option Chain Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
            LIVE OPTION CHAIN ({instrument}) — STRIKES &amp; PREMIUMS
          </h3>
          <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
            Source: Dhan · updated {data.timestampIst || "09:15:00 IST"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Expiry Selector (Section 3.3) */}
          {(data.expiries ?? []).length > 0 && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-muted-foreground">Expiry:</span>
              <select
                value={data.selectedExpiry}
                onChange={(e) => onSelectExpiry?.(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              >
                {data.expiries.map((exp) => (
                  <option key={exp} value={exp}>
                    {exp}
                  </option>
                ))}
              </select>
            </div>
          )}

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

      {/* Derivative Buildup, PCR & Max Pain Summary Bar (Section 3.6) */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-xs">
        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground">PUT-CALL RATIO (PCR):</p>
          <p className="mt-0.5 font-bold text-foreground text-sm flex items-center gap-1">
            {data.pcr?.toFixed(2) ?? "1.00"}
            <span
              className={`text-[10px] font-semibold ${
                (data.pcr ?? 1) >= 1 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {(data.pcr ?? 1) >= 1.2 ? "(Bullish Buildup)" : (data.pcr ?? 1) <= 0.8 ? "(Bearish Buildup)" : "(Neutral)"}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground">MAX PAIN STRIKE:</p>
          <p className="mt-0.5 font-bold text-primary text-sm flex items-center gap-1">
            <Target className="h-3.5 w-3.5" />
            {data.maxPain ? data.maxPain.toFixed(0) : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground">CALL WRITING / RESISTANCE:</p>
          <p className="mt-0.5 font-bold text-rose-400 text-xs truncate">
            {data.callBuildup ?? "Defending Upper Bound"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground">PUT WRITING / SUPPORT:</p>
          <p className="mt-0.5 font-bold text-emerald-400 text-xs truncate">
            {data.putBuildup ?? "Floor Support Holding"}
          </p>
        </div>
      </div>

      {/* Full Option Chain Table (Section 3.1 & 3.2) */}
      <div className="mt-3 overflow-x-auto max-h-[500px]">
        <table className="w-full text-center font-mono text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground bg-[#0B1015]">
              <th className="py-2.5 px-2 text-left">CE OI</th>
              <th className="py-2.5 px-2 text-left">CE CHG</th>
              <th className="py-2.5 px-2 text-left">CE IV</th>
              <th className="py-2.5 px-2 text-left">CALL LTP ({curSymbol})</th>
              <th className="py-2.5 px-2">CALL TYPE</th>
              <th className="py-2.5 px-3 font-bold text-foreground">STRIKE</th>
              <th className="py-2.5 px-2">PUT TYPE</th>
              <th className="py-2.5 px-2 text-right">PUT LTP ({curSymbol})</th>
              <th className="py-2.5 px-2 text-right">PE IV</th>
              <th className="py-2.5 px-2 text-right">PE CHG</th>
              <th className="py-2.5 px-2 text-right">PE OI</th>
              <th className="py-2.5 px-2 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {(data.strikes ?? []).map((row) => (
              <tr
                key={row.strike}
                className={`hover:bg-accent/30 transition ${
                  row.isAtm ? "bg-primary/10 border-y border-primary/40 font-bold" : ""
                }`}
              >
                {/* CE Data */}
                <td className="py-2 px-2 text-left text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {(row.callOi ?? 0).toLocaleString("en-IN")}
                    {row.isHighestCallOi && (
                      <span className="rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 px-1 py-0.2 text-[8px] font-bold">
                        MAX OI
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2 text-left text-[11px]">
                  <span className={(row.callOiChg ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {(row.callOiChg ?? 0) >= 0 ? "+" : ""}
                    {(row.callOiChg ?? 0).toLocaleString("en-IN")}
                  </span>
                </td>
                <td className="py-2 px-2 text-left text-[10px] text-muted-foreground">
                  {row.callIv ? `${row.callIv.toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 px-2 text-left font-bold text-emerald-400">
                  {curSymbol}
                  {row.callLtp.toFixed(2)}
                </td>
                <td className="py-2 px-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
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

                {/* Strike Center */}
                <td className="py-2 px-3 font-bold text-foreground text-sm">
                  {row.strike} {row.isAtm ? "(ATM)" : ""}
                </td>

                {/* PE Data */}
                <td className="py-2 px-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
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
                <td className="py-2 px-2 text-right font-bold text-rose-400">
                  {curSymbol}
                  {row.putLtp.toFixed(2)}
                </td>
                <td className="py-2 px-2 text-right text-[10px] text-muted-foreground">
                  {row.putIv ? `${row.putIv.toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 px-2 text-right text-[11px]">
                  <span className={(row.putOiChg ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {(row.putOiChg ?? 0) >= 0 ? "+" : ""}
                    {(row.putOiChg ?? 0).toLocaleString("en-IN")}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-muted-foreground">
                  <div className="flex items-center justify-end gap-1">
                    {(row.putOi ?? 0).toLocaleString("en-IN")}
                    {row.isHighestPutOi && (
                      <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1 py-0.2 text-[8px] font-bold">
                        MAX OI
                      </span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="py-2 px-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => onSelectStrike(row.strike, "CE", row.callLtp)}
                      className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
                      title="Select Call Strike"
                    >
                      CE
                    </button>
                    <button
                      onClick={() => onSelectStrike(row.strike, "PE", row.putLtp)}
                      className="rounded bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 transition"
                      title="Select Put Strike"
                    >
                      PE
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
