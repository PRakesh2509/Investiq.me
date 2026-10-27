import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { DESKTOP_SYMBOLS } from "@/lib/desktop-data";
import { STOCKS } from "@/lib/market-data";

export function StocksSection() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(DESKTOP_SYMBOLS.map((s) => [s, true])),
  );
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Stock Management</h3>
        <button
          onClick={() => toast.success("Stock data refreshed (mock)")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Exchange</th>
            <th>Sector</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {DESKTOP_SYMBOLS.map((s) => {
            const meta = STOCKS[s]!;
            return (
              <tr key={s}>
                <td className="font-mono">{s}.NS</td>
                <td>{meta.name}</td>
                <td>NSE</td>
                <td className="text-muted-foreground">{meta.sector}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      enabled[s]
                        ? "bg-success/15 text-success"
                        : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {enabled[s] ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => setEnabled((prev) => ({ ...prev, [s]: !prev[s] }))}
                    className="rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] hover:bg-accent"
                  >
                    Toggle
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
