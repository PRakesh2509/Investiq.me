import { toast } from "sonner";
import { Download } from "lucide-react";
import { NOTIFICATIONS_LOG } from "@/lib/desktop-data";

export function NotificationsSection() {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Notifications Log</h3>
        <button
          onClick={() => toast.success("Exported to CSV (mock)")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Stock</th>
            <th>Content</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATIONS_LOG.map((n, i) => (
            <tr key={i}>
              <td className="font-mono text-xs">{n.ts}</td>
              <td>{n.type}</td>
              <td className="font-medium">{n.stock}</td>
              <td className="text-muted-foreground">{n.content}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    n.status === "Sent"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {n.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
