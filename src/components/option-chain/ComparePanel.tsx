import { Scale, X } from "lucide-react";
import { compact, n2, type Row } from "./shared";

export function ComparePanel({
  compareRows,
  onClear,
}: {
  compareRows: Row[];
  onClear: () => void;
}) {
  return (
    <>
      {compareRows.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
            <Scale className="h-3.5 w-3.5" /> Comparing {compareRows.length} strike
            {compareRows.length > 1 ? "s" : ""}
            <button
              onClick={() => onClear()}
              aria-label="Clear comparison"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-[11px]">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Strike</th>
                  <th className="px-2 py-1">CE LTP</th>
                  <th className="px-2 py-1">CE IV</th>
                  <th className="px-2 py-1">CE Δ</th>
                  <th className="px-2 py-1">CE OI</th>
                  <th className="px-2 py-1">PE LTP</th>
                  <th className="px-2 py-1">PE IV</th>
                  <th className="px-2 py-1">PE Δ</th>
                  <th className="px-2 py-1">PE OI</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.strike} className="border-t border-border/50">
                    <td className="px-2 py-1 text-left font-semibold">{n2(r.strike, 0)}</td>
                    <td className="px-2 py-1">{n2(r.call.ltp)}</td>
                    <td className="px-2 py-1">{r.call.iv ? r.call.iv.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1">{r.call.delta.toFixed(3)}</td>
                    <td className="px-2 py-1">{compact(r.call.oi)}</td>
                    <td className="px-2 py-1">{n2(r.put.ltp)}</td>
                    <td className="px-2 py-1">{r.put.iv ? r.put.iv.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1">{r.put.delta.toFixed(3)}</td>
                    <td className="px-2 py-1">{compact(r.put.oi)}</td>
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
