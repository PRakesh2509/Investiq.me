import { Activity, Maximize2, Minimize2, Send } from "lucide-react";
import { DataQualityBadges } from "@/components/DataQualityBadges";
import { useSecondsSince } from "./hooks";
import type { WorkstationData } from "./types";

function DataAge({ updatedAt }: { updatedAt: number | null }) {
  const age = useSecondsSince(updatedAt);
  return <strong className="text-foreground">{age == null ? "—" : `${age}s`}</strong>;
}

export function WorkstationHeader({
  data,
  stale,
  updatedAt,
  sendingAlert,
  canSendAlert,
  onSendAlert,
  isFullscreen,
  onToggleFullscreen,
}: {
  data: WorkstationData | null;
  stale: boolean;
  updatedAt: number | null;
  sendingAlert: boolean;
  canSendAlert: boolean;
  onSendAlert: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/60 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground font-bold shadow-glow">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold tracking-tight">F&amp;O LIVE</h1>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Institutional Workstation
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Multi-pivot confluence, live TradingView charts, option calculator &amp; execution risk
            management.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* Market Session Status (Requirement 2) */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-[11px] font-semibold ${
            data?.isMarketOpen
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              data?.isMarketOpen ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          {data?.marketSessionText ?? "CONNECTING…"}
          <DataQualityBadges flags={stale ? { ...data, freshnessStatus: "stale" } : data} />
        </span>

        {/* Live Tick Updates (Requirement 3) */}
        <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          DATA AGE: <DataAge updatedAt={updatedAt} />
        </span>

        {/* Telegram Alert Button (Requirement 52) */}
        <button
          onClick={onSendAlert}
          disabled={sendingAlert || !canSendAlert}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1 font-medium text-primary hover:bg-primary/20 transition disabled:opacity-50"
          title={canSendAlert ? "Send trade alert to Telegram" : "Admin login required"}
        >
          <Send className={`h-3.5 w-3.5 ${sendingAlert ? "animate-spin" : ""}`} />
          <span>Telegram Alert</span>
        </button>

        {/* Fullscreen Expand (Requirement 17) */}
        <button
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-pressed={isFullscreen}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/60 px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
