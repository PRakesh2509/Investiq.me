import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/context/AdminContext";
import { adminPost } from "../adminFetch";
import { WORKSTATION_INSTRUMENTS } from "@/lib/terminal-workstation.functions";
import { DhanConnectModal } from "@/components/DhanConnectModal";
import GeopoliticalMacroIntelligence from "./GeopoliticalMacroIntelligence";
import BacktestValidationModal from "./BacktestValidationModal";
import { REFRESH_INTERVAL_MS, type TF } from "./workstation/constants";
import type { ChartToggles, ChartType } from "./workstation/types";
import { useWorkstationFeed } from "./workstation/useWorkstationFeed";
import { useOptionCalculator } from "./workstation/useOptionCalculator";
import { WorkstationHeader } from "./workstation/WorkstationHeader";
import { InstrumentTabs } from "./workstation/InstrumentTabs";
import { SpotHero } from "./workstation/SpotHero";
import { SignalBanner } from "./workstation/SignalBanner";
import { ChartPanel } from "./workstation/ChartPanel";
import { OptionCalculator } from "./workstation/OptionCalculator";
import { OptionChainPanel } from "./workstation/OptionChainPanel";
import { SignalHistory } from "./workstation/SignalHistory";
import { StatusStrip } from "./workstation/StatusStrip";

export default function TradingTerminalWorkstation() {
  const { isAdmin } = useAdmin();
  const [instrument, setInstrument] = useState<string>("NIFTY 50");
  const [tf, setTf] = useState<TF>("1M");
  const [chartType, setChartType] = useState<ChartType>("CANDLES");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sendingAlert, setSendingAlert] = useState<boolean>(false);
  const [setupActive, setSetupActive] = useState<boolean>(true);
  const [isBacktestModalOpen, setIsBacktestModalOpen] = useState<boolean>(false);
  const [dhanModalOpen, setDhanModalOpen] = useState<boolean>(false);

  // Technical indicator overlays
  const [toggles, setToggles] = useState<ChartToggles>({
    ema9: true,
    ema21: true,
    vwap: true,
    supertrend: true,
    volume: true,
  });

  const feed = useWorkstationFeed(instrument, tf);
  const { data, error, updatedAt, isRefreshing, intelligence, bars, refresh } = feed;

  const cfg = WORKSTATION_INSTRUMENTS[instrument] ?? WORKSTATION_INSTRUMENTS["NIFTY 50"];
  const curSymbol = data?.currency ?? cfg.currency;
  const tvSymbol = cfg.tvSymbol ?? "NSE:NIFTY";
  const calc = useOptionCalculator(instrument, data, cfg);

  // The last server payload is kept on a failed refresh; flag it as stale rather than hiding it.
  const stale = !!data && !!error;

  // Escape leaves fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const handleSendTelegramAlert = async () => {
    if (!data) return;
    setSendingAlert(true);
    try {
      const res = await adminPost("/api/public/hooks/telegram-bot", {
        action: "trade_signal",
        instrument,
        contract: calc.selectedContract,
        entry: data.spotEntry,
        tp1: data.tp1,
        tp2: data.tp2,
        sl: data.stopLoss,
        direction: data.direction,
      });
      if (res.ok) {
        toast.success(`Alert sent to Telegram for ${calc.selectedContract}!`);
      } else {
        toast.error(`Telegram alert failed: ${res.error ?? "unknown error"}`);
      }
    } finally {
      setSendingAlert(false);
    }
  };

  return (
    <div
      className={`space-y-4 text-foreground ${isFullscreen ? "fixed inset-0 z-50 overflow-y-auto bg-hero p-6" : ""}`}
    >
      <WorkstationHeader
        data={data}
        stale={stale}
        updatedAt={updatedAt}
        sendingAlert={sendingAlert}
        canSendAlert={isAdmin}
        onSendAlert={handleSendTelegramAlert}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
      />

      <InstrumentTabs instrument={instrument} setInstrument={setInstrument} />

      {data?.tokenStatus?.isExpired && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/60 bg-rose-950/40 p-3.5 text-xs text-rose-300 shadow-md backdrop-blur"
        >
          <div className="flex items-center gap-2.5">
            <span className="font-bold uppercase tracking-wider text-rose-400">
              🚨 DHAN ACCESS TOKEN EXPIRED:
            </span>
            <span>
              Daily token renewal required ({data.tokenStatus.validUntil ? `expired: ${data.tokenStatus.validUntil}` : "daily 24h cycle"}).
              Update your token to stream tick-by-tick real-time F&O feeds.
            </span>
          </div>
          <button
            onClick={() => setDhanModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 font-mono text-xs font-bold text-white shadow hover:bg-rose-600 transition"
          >
            Update Token / Connect Dhan
          </button>
        </div>
      )}

      {data?.grade === "DHAN_UNAVAILABLE" && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-950/30 p-3.5 text-xs text-amber-300 shadow-md backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-amber-400">
              ⚠️ DHAN FEED STATUS:
            </span>
            <span>
              {data.rationale} · Last successful Dhan timestamp:{" "}
              <strong>{data.timestampIst}</strong>
            </span>
          </div>
          <button
            onClick={() => setDhanModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1 font-mono text-xs font-bold text-amber-200 hover:bg-amber-500/30 transition"
          >
            Connect Dhan
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <span>
            {data
              ? `Showing the last server quote (stale): ${error}`
              : `Could not load ${instrument}: ${error}`}
          </span>
          <button
            onClick={() => refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 py-1 font-semibold hover:bg-destructive/20"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Retry
          </button>
        </div>
      )}

      {!data ? (
        <div className="rounded-2xl border border-border bg-surface/60 p-12 text-center text-sm text-muted-foreground">
          {error
            ? "No live data to display."
            : `Loading live ${instrument} quote and option chain…`}
        </div>
      ) : (
        <>
          <SpotHero
            data={data}
            instrument={instrument}
            cfg={cfg}
            curSymbol={curSymbol}
            stale={stale}
          />

          <SignalBanner data={data} curSymbol={curSymbol} />

          {/* 2-Column Workstation Grid */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="space-y-3 xl:col-span-7">
              <ChartPanel
                data={data}
                cfg={cfg}
                curSymbol={curSymbol}
                tvSymbol={tvSymbol}
                tf={tf}
                setTf={setTf}
                chartType={chartType}
                setChartType={setChartType}
                toggles={toggles}
                setToggles={setToggles}
                setupActive={setupActive}
                setSetupActive={setSetupActive}
                bars={bars}
                barsFlags={feed.barsFlags}
                barsLoading={feed.barsLoading}
                barsError={feed.barsError}
                isRefreshing={isRefreshing}
                onRefresh={() => refresh()}
                updatedAt={updatedAt}
                stale={stale}
                maxLoss={calc.maxLoss}
                tp2Profit={calc.tp2Profit}
              />
            </div>
            <div className="space-y-3 xl:col-span-5">
              <OptionCalculator data={data} instrument={instrument} calc={calc} />
            </div>
          </div>

          <OptionChainPanel
            data={data}
            cfg={cfg}
            instrument={instrument}
            curSymbol={curSymbol}
            isRefreshing={isRefreshing}
            onRefresh={() => refresh()}
            onSelectStrike={calc.handleSelectStrike}
          />

          <SignalHistory
            data={data}
            onOpenBacktest={() => setIsBacktestModalOpen(true)}
            backtestReady={!!intelligence?.backtestReport}
          />
        </>
      )}

      {/* Geopolitical & Macroeconomic Intelligence */}
      <GeopoliticalMacroIntelligence
        report={intelligence?.macroReport ?? null}
        newsItems={intelligence?.newsEvents ?? []}
        onRefresh={() => refresh(true)}
      />

      {/* Comparative Backtest & Alpha Benchmark Modal */}
      <BacktestValidationModal
        report={intelligence?.backtestReport ?? null}
        isOpen={isBacktestModalOpen}
        onClose={() => setIsBacktestModalOpen(false)}
      />

      {/* DhanHQ Direct Connection & Token Renewal Modal */}
      <DhanConnectModal
        isOpen={dhanModalOpen}
        onClose={() => setDhanModalOpen(false)}
        onStatusChange={() => void refresh(true)}
      />

      <StatusStrip
        data={data}
        stale={stale}
        updatedAt={updatedAt}
        refreshSeconds={REFRESH_INTERVAL_MS / 1000}
      />

      <footer className="border-t border-border pt-4 pb-8 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        INSTITUTIONAL TRADING ENGINE LOGIC. EDUCATIONAL &amp; RESEARCH SIGNALS. TRADE RESPONSIBLY.
      </footer>
    </div>
  );
}
