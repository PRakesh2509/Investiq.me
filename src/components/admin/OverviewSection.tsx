import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { NOTIFICATIONS_LOG, USERS_MOCK } from "@/lib/desktop-data";
import type { AdminTab } from "./tabs";

export function OverviewSection({ onSelectTab }: { onSelectTab?: (t: AdminTab) => void }) {
  const { keyStatus } = useAdmin();
  const activeKeysCount = [keyStatus.nse, keyStatus.global].filter((k) => k.configured).length;
  const stats = [
    { l: "Total users", v: USERS_MOCK.length.toString() },
    {
      l: "Active today",
      v: USERS_MOCK.filter((u) => u.lastLogin === "2026-07-14").length.toString(),
    },
    { l: "Configured API Keys", v: activeKeysCount.toString() },
    {
      l: "Notifications sent",
      v: NOTIFICATIONS_LOG.filter((n) => n.status === "Sent").length.toString(),
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border border-border bg-surface/60 p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.l}</p>
            <p className="mt-2 font-display text-2xl font-semibold">{s.v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <h3 className="font-display text-sm font-semibold">Quick actions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onSelectTab?.("apikeys")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Create API Key
          </button>
          {["Send test Telegram", "Refresh sheet data", "Export notifications"].map((a) => (
            <button
              key={a}
              onClick={() => toast.info(`${a} — mock`)}
              className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-accent"
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
