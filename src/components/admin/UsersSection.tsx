import { toast } from "sonner";
import { USERS_MOCK } from "@/lib/desktop-data";
import { Stat } from "./shared";

export function UsersSection() {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <h3 className="font-display text-lg font-semibold">User Management</h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Total users" v={USERS_MOCK.length.toString()} />
        <Stat
          label="Active today"
          v={USERS_MOCK.filter((u) => u.lastLogin === "2026-07-14").length.toString()}
        />
        <Stat label="Inactive" v={USERS_MOCK.filter((u) => !u.active).length.toString()} />
      </div>
      <table className="admin-table mt-6">
        <thead>
          <tr>
            <th>Name</th>
            <th>Registered</th>
            <th>Last login</th>
            <th>Holdings</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {USERS_MOCK.map((u) => (
            <tr key={u.name}>
              <td className="font-medium">{u.name}</td>
              <td className="text-muted-foreground">{u.regDate}</td>
              <td className="text-muted-foreground">{u.lastLogin}</td>
              <td>{u.holdings}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    u.active ? "bg-success/15 text-success" : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {u.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <button
                  onClick={() => toast.info(`Viewing ${u.name} (mock)`)}
                  className="rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] hover:bg-accent"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
