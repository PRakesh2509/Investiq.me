import { Clock, ExternalLink, RefreshCw } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { DataQualityBadges, type DataQualityFlags } from "@/components/DataQualityBadges";
import type { WorkstationBar } from "@/lib/terminal-workstation.functions";
import WorkstationTradingChart from "../WorkstationTradingChart";
import { TF_SECONDS, TIMEFRAMES, REFRESH_INTERVAL_MS, type TF } from "./constants";
import { useCandleCountdown, useSecondsSince } from "./hooks";
import type { ChartToggles, ChartType, InstrumentConfig, WorkstationData } from "./types";

function LiveCountdown({ updatedAt }: { updatedAt: number | null }) {
  const age = useSecondsSince(updatedAt);
  const periodSec = REFRESH_INTERVAL_MS / 1000;
  return <>LIVE · {age == null ? "—" : `${periodSec - (age % periodSec)}s`}</>;
}

function CandleCountdown({ seconds }: { seconds: number }) {
  return <>{useCandleCountdown(seconds)}</>;
}

const fx = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "—";

export function ChartPanel(props: {
  data: WorkstationData;
  cfg: InstrumentConfig;
  curSymbol: string;
  tvSymbol: string;
  tf: TF;
  setTf: (t: TF) => void;
  chartType: ChartType;
  setChartType: (t: ChartType) => void;
  toggles: ChartToggles;
  setToggles: Dispatch<SetStateAction<ChartToggles>>;
  setupActive: boolean;
  setSetupActive: Dispatch<SetStateAction<boolean>>;
  bars: WorkstationBar[];
  barsFlags: DataQualityFlags | null;
  barsLoading: boolean;
  barsError: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  updatedAt: number | null;
  stale: boolean;
  maxLoss: number;
  tp2Profit: number;
}) {
  const {
    data,
    cfg,
    curSymbol,
    tvSymbol,
    tf,
    setTf,
    chartType,
    setChartType,
    toggles,
    setToggles,
    setupActive,
    setSetupActive,
    bars,
    barsFlags,
    barsLoading,
    barsError,
    isRefreshing,
    onRefresh,
    updatedAt,
    stale,
    maxLoss,
    tp2Profit,
  } = props;
  const isLive = !data.isSimulated && !stale && data.isMarketOpen;

  const last = bars.length ? bars[bars.length - 1] : null;
  const ohlc = {
    o: fx(last ? last.open : data.open),
    h: fx(last ? last.high : data.high),
    l: fx(last ? last.low : data.low),
    c: fx(last ? last.close : data.spotPrice),
    vol: (last ? last.volume : data.volume)?.toLocaleString("en-IN") ?? "—",
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur">
      {/* Chart Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">{cfg.name}</span>
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
            {cfg.tag}
          </span>
          {isLive ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <LiveCountdown updatedAt={updatedAt} />
            </span>
          ) : (
            <DataQualityBadges
              flags={stale ? { ...data, freshnessStatus: "stale" } : data}
              marketClosed={!data.isMarketOpen}
            />
          )}
          <span className="text-muted-foreground text-[11px]">{tf} Candle</span>
          <DataQualityBadges flags={barsFlags} />
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <CandleCountdown seconds={TF_SECONDS[tf]} />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-foreground">
            {curSymbol}
            {data.spotPrice.toFixed(2)}
          </span>
          <span
            className={`font-mono text-[11px] ${
              data.change >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {data.change >= 0 ? "+" : ""}
            {data.change.toFixed(2)} ({data.changePct >= 0 ? "+" : ""}
            {data.changePct.toFixed(2)}%)
          </span>
          <button
            onClick={onRefresh}
            className="p-1 text-muted-foreground hover:text-foreground transition"
            title="Refresh Quote"
            aria-label="Refresh quote"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Timeframes & Indicators Bar (Requirements 11, 12, 13) */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Timeframes */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-mono font-medium transition ${
                tf === t
                  ? "bg-gradient-primary text-primary-foreground font-bold shadow-glow"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
          {/* Candlestick / Line Toggle (Requirement 12) */}
          <div className="ml-2 flex rounded-lg border border-border bg-background/50 p-0.5">
            <button
              onClick={() => setChartType("CANDLES")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase transition ${
                chartType === "CANDLES"
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              CANDLES
            </button>
            <button
              onClick={() => setChartType("LINE")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase transition ${
                chartType === "LINE"
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              LINE
            </button>
          </div>
        </div>

        {/* Technical Indicator Overlays (Requirement 13) */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-mono text-[10px] text-muted-foreground">INDICATORS:</span>
          <button
            onClick={() => setToggles((p) => ({ ...p, ema9: !p.ema9 }))}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
              toggles.ema9
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/40"
                : "text-muted-foreground border border-transparent"
            }`}
          >
            EMA 9
          </button>
          <button
            onClick={() => setToggles((p) => ({ ...p, ema21: !p.ema21 }))}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
              toggles.ema21
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                : "text-muted-foreground border border-transparent"
            }`}
          >
            EMA 21
          </button>
          <button
            onClick={() => setToggles((p) => ({ ...p, vwap: !p.vwap }))}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
              toggles.vwap
                ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/40"
                : "text-muted-foreground border border-transparent"
            }`}
          >
            VWAP
          </button>
          <button
            onClick={() => setToggles((p) => ({ ...p, supertrend: !p.supertrend }))}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
              toggles.supertrend
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
                : "text-muted-foreground border border-transparent"
            }`}
          >
            SUPERTREND
          </button>
          <button
            onClick={() => setToggles((p) => ({ ...p, volume: !p.volume }))}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
              toggles.volume
                ? "bg-purple-500/15 text-purple-400 border border-purple-500/40"
                : "text-muted-foreground border border-transparent"
            }`}
          >
            Volume
          </button>
        </div>
      </div>

      {/* Action Tools & OHLC Row (Requirements 14, 15, 16) */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSetupActive((p) => !p)}
            className={`rounded border px-2 py-0.5 font-mono font-bold text-[10px] transition ${
              setupActive
                ? "bg-teal-500/15 border-teal-500/40 text-teal-400"
                : "bg-surface text-muted-foreground border-border"
            }`}
          >
            {setupActive ? "SETUP TOOL ACTIVE" : "SETUP TOOL OFF"}
          </button>
          <a
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition"
            title="Open live chart on TradingView in new tab"
          >
            <ExternalLink className="h-3 w-3" />
            <span>TRADINGVIEW ↗</span>
          </a>
        </div>

        {/* Volume & OHLC (Requirement 14) */}
        <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span>
            O: <strong className="text-foreground">{ohlc.o}</strong>
          </span>
          <span>
            H: <strong className="text-foreground">{ohlc.h}</strong>
          </span>
          <span>
            L: <strong className="text-foreground">{ohlc.l}</strong>
          </span>
          <span>
            C: <strong className="text-foreground">{ohlc.c}</strong>
          </span>
          <span>
            Vol: <strong className="text-foreground">{ohlc.vol}</strong>
          </span>
        </div>
      </div>

      {/* TradingView Lightweight Charts Engine — 100% Reliable, Zero Popups */}
      <div className="relative mt-2 h-[480px] w-full overflow-hidden rounded-xl border border-border bg-[#0B1015] shadow-inner">
        {barsLoading && !bars.length && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-xs font-mono text-muted-foreground">
            Loading {tf} candles…
          </div>
        )}
        {!barsLoading && !bars.length && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 px-6 text-center text-xs font-mono text-muted-foreground">
            <span>{barsError ?? "No chart data available."}</span>
          </div>
        )}
        <WorkstationTradingChart
          bars={bars}
          toggles={toggles}
          chartType={chartType}
          entry={data.spotEntry}
          tp1={data.tp1}
          tp2={data.tp2}
          stopLoss={data.stopLoss}
          setupActive={setupActive}
        />

        {/* Interactive Setup Overlay (Requirements 15, 16, 26) */}
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-xl border border-border bg-background/90 p-3 text-[11px] font-mono shadow-elegant backdrop-blur">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-1.5">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {data.direction === "CALL" ? "LONG SETUP" : "SHORT SETUP"} (1:1.50 R:R)
            </div>
            <div className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              ACTIVE · TP1: {curSymbol}
              {data.tp1.toFixed(2)}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <div>
              Risk (-SL):{" "}
              <strong className="text-rose-400">-₹{maxLoss.toLocaleString("en-IN")}</strong>
            </div>
            <div>
              Reward (+TP2):{" "}
              <strong className="text-emerald-400">+₹{tp2Profit.toLocaleString("en-IN")}</strong>
            </div>
            <div>
              Entry Spot: <strong className="text-foreground">{data.spotEntry.toFixed(2)}</strong>
            </div>
            <div>
              Stop Loss:{" "}
              <strong className="text-rose-400">
                {curSymbol}
                {data.stopLoss.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
