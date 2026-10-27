import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, LogOut } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { ApiKeysSection } from "@/components/admin/ApiKeysSection";
import { NotificationsSection } from "@/components/admin/NotificationsSection";
import { OverviewSection } from "@/components/admin/OverviewSection";
import { SheetsSection } from "@/components/admin/SheetsSection";
import { StocksSection } from "@/components/admin/StocksSection";
import { TelegramSection } from "@/components/admin/TelegramSection";
import { ADMIN_TABS, type AdminTab } from "@/components/admin/tabs";
import { UsersSection } from "@/components/admin/UsersSection";

export const Route = createFileRoute("/desktop/admin")({
  component: AdminPanel,
});

function AdminPanel() {
  const { isAdmin, sessionReady, logout } = useAdmin();
  const [tab, setTab] = useState<AdminTab>("overview");

  // Wait for the server to confirm the session before deciding what to render.
  if (!sessionReady) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-md rounded-2xl border border-border bg-surface/60 p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 font-display text-xl font-semibold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Triple-click the footer at the bottom of the page to sign in.
          </p>
          <Link
            to="/desktop"
            className="mt-6 inline-block rounded-lg border border-border bg-background/50 px-4 py-2 text-sm hover:bg-accent"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Admin Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure integrations, manage users, and monitor notifications.
          </p>
        </div>
        <button
          onClick={async () => {
            await logout();
            toast.success("Signed out of admin");
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs hover:bg-accent"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {ADMIN_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm transition ${
              tab === t.id
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewSection onSelectTab={setTab} />}
      {tab === "apikeys" && <ApiKeysSection />}
      {tab === "telegram" && <TelegramSection />}
      {tab === "sheets" && <SheetsSection />}
      {tab === "stocks" && <StocksSection />}
      {tab === "notifications" && <NotificationsSection />}
      {tab === "users" && <UsersSection />}
    </div>
  );
}
