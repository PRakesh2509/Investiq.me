import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import type { ListedIpo } from "@/lib/listed-ipos.functions";
import { fmtDate, inr } from "./format";

export function ListedIposPanel({
  rows,
  isLoading,
  error,
}: {
  rows: ListedIpo[];
  isLoading: boolean;
  error?: string;
}) {
  const priced = rows.filter((r) => r.changePct != null);
  const gainers = priced.filter((r) => (r.changePct ?? 0) >= 0).length;
  const losers = priced.length - gainers;
  const avg = priced.length
    ? priced.reduce((s, r) => s + (r.changePct ?? 0), 0) / priced.length
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface/40 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading live prices of recently
        listed Indian IPOs…
      </div>
    );
  }
  if (error && rows.length === 0) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
        Couldn't load listed IPOs: {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
        No recently listed IPOs found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Trading In Profit" v={`${gainers} Issues`} tone="success" />
        <StatBox label="Trading In Loss" v={`${losers} Issues`} tone="destructive" />
        <StatBox
          label="Avg. Return vs Issue Price"
          v={avg == null ? "—" : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`}
          tone={(avg ?? 0) >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">Company</th>
              <th className="px-4 py-3 text-right font-medium">Issue price</th>
              <th className="px-4 py-3 text-right font-medium">Current price</th>
              <th className="px-4 py-3 text-right font-medium">Gain / Loss</th>
              <th className="px-4 py-3 text-right font-medium">Today</th>
              <th className="px-4 py-3 text-right font-medium">Listed on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.changePct;
              const pos = (pct ?? 0) >= 0;
              return (
                <tr
                  key={r.symbol}
                  className="border-b border-border/60 last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {r.symbol}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{r.company}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{inr(r.issuePrice)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{inr(r.price)}</td>
                  <td className="px-4 py-3 text-right">
                    {pct == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-end gap-1 font-medium ${
                          pos ? "text-emerald-400" : "text-destructive"
                        }`}
                      >
                        {pos ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {pos ? "+" : ""}
                        {pct.toFixed(2)}%
                        <span className="ml-1 text-[11px] opacity-80">
                          ({pos ? "+" : "−"}
                          {inr(Math.abs(r.changeAbs ?? 0))})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {r.dayChangePct == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={r.dayChangePct >= 0 ? "text-emerald-400" : "text-destructive"}
                      >
                        {r.dayChangePct >= 0 ? "+" : ""}
                        {r.dayChangePct.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {fmtDate(r.listingDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Gain / Loss compares the live market price with the official IPO issue price. Prices refresh
        every 60 seconds from exchange data.
      </p>
    </div>
  );
}

function StatBox({
  label,
  v,
  tone,
}: {
  label: string;
  v: string;
  tone: "success" | "destructive";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${tone === "success" ? "text-emerald-400" : "text-destructive"}`}
      >
        {v}
      </p>
    </div>
  );
}
