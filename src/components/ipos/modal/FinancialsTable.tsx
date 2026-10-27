import { FileSpreadsheet } from "lucide-react";
import type { IPO } from "@/lib/ipos";

export function FinancialsTable({ ipo }: { ipo: IPO }) {
  return (
    <>
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
                    <td className="py-2 font-medium text-emerald-400">
                      ₹{row.patCr.toLocaleString("en-IN")} Cr
                    </td>
                    <td className="py-2">
                      {row.ebitdaMarginPct ? `${row.ebitdaMarginPct}%` : "—"}
                    </td>
                    <td className="py-2">{row.roePct ? `${row.roePct}%` : "—"}</td>
                    <td className="py-2">
                      {row.debtToEquity !== undefined ? row.debtToEquity.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
