import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, LogOut } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { ApiKeysSection } from "@/components/admin/ApiKeysSection";
import { NotificationsSection } from "@/components/admin/NotificationsSection";
import { SheetsSection } from "@/components/admin/SheetsSection";
import { StocksSection } from "@/components/admin/StocksSection";
import { TelegramSection } from "@/components/admin/TelegramSection";
import { ADMIN_TABS, type AdminTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/desktop/admin")({
  component: AdminPanel,
});

function AdminLoginForm() {
  const { loginDetailed } = useAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await loginDetailed(username.trim(), password.trim());
      if (res.ok) {
        toast.success("Signed in to Admin Panel");
      } else {
        setError(res.error || "Invalid username or password");
        toast.error(res.error || "Authentication failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface/80 p-8 shadow-xl backdrop-blur">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-center font-display text-2xl font-semibold">Admin Panel Sign In</h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Enter admin credentials to manage DhanHQ integration, API keys, and alert dispatches.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In to Admin Panel"}
          </button>
        </form>

        <div className="mt-6 border-t border-border pt-4 text-center">
          <Link to="/desktop" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to Terminal
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminPanel() {
  const { isAdmin, sessionReady, logout } = useAdmin();
  const [tab, setTab] = useState<AdminTab>("apikeys");

  // Wait for the server to confirm the session before deciding what to render.
  if (!sessionReady) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  if (!isAdmin) {
    return <AdminLoginForm />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Admin Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure integrations, API keys, and monitor notifications.
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

      {tab === "apikeys" && <ApiKeysSection />}
      {tab === "telegram" && <TelegramSection />}
      {tab === "sheets" && <SheetsSection />}
      {tab === "stocks" && <StocksSection />}
      {tab === "notifications" && <NotificationsSection />}
    </div>
  );
}
