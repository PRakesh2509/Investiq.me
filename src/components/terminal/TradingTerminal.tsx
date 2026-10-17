import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBars, type Bar } from "@/lib/terminal.functions";
import { ema, rsi } from "@/lib/indicators";
import type { Toggles } from "./TradingChart";
import { Lock, TrendingUp, TrendingDown, Activity, RefreshCw } from "lucide-react";

const ClientChart = lazy(() => import("./TradingChart"));

export interface Instrument {
  key: string;
  label: string;
  yahoo: string;
  priceDecimals?: number;
  currency?: string;
}

const TIMEFRAMES = ["1M", "5M", "15M", "1H", "4H", "1D"] as const;
type TF = (typeof TIMEFRAMES)[number];

export default function TradingTerminal({
  instruments,
  currencySymbol = "$",
}: {
  instruments: Instrument[];
  currencySymbol?: string;
}) {
  const [symbolKey, setSymbolKey] = useState(instruments[0].key);
  const [tf, setTf] = useState<TF>("5M");
  const [bars, setBars] = useState<Bar[]>([]);
  const [price, setPrice] = useState(0);
  const [prevClose, setPrevClose] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggles, setToggles] = useState<Toggles>({
    ema9: true, ema21: true, ema50: true, bb: false, vwap: true, volume: true,
  });

  const fetchFn = useServerFn(getBars);
  const inst = useMemo(
    () => instruments.find((i) => i.key === symbolKey) ?? instruments[0],
    [instruments, symbolKey],
  );

  useEffect(() => {
    let stop = false;
    const run = async () => {
      setLoading(true);
      const r = await fetchFn({ data: { symbol: inst.yahoo, timeframe: tf } });
      if (stop) return;
      if (r.ok) {
        setBars(r.bars);
        setPrice(r.price);
        setPrevClose(r.prevClose);
      }
      setLoading(false);
    };
    run();
    const id = setInterval(run, 10000);
    return () => { stop = true; clearInterval(id); };
  }, [inst.yahoo, tf, fetchFn]);

  const change = price - prevClose;
  const pct = prevClose ? (change / prevClose) * 100 : 0;
  const up = change >= 0;

  // Signals
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const e9 = useMemo(() => ema(closes, 9), [closes]);
  const e21 = useMemo(() => ema(closes, 21), [closes]);
  const e50 = useMemo(() => ema(closes, 50), [closes]);
  const rsiArr = useMemo(() => rsi(closes, 14), [closes]);
  const last = bars[bars.length - 1];
  const lastRsi = rsiArr[rsiArr.length - 1] ?? null;
  const bodyPct = last
    ? Math.round((Math.abs(last.close - last.open) / Math.max(last.high - last.low, 0.0001)) * 100)
    : 0;
  const lastE9 = e9[e9.length - 1], lastE21 = e21[e21.length - 1], lastE50 = e50[e50.length - 1];
  const bull = lastE9 != null && lastE21 != null && lastE50 != null && lastE9 > lastE21 && (last?.close ?? 0) > lastE50;
  const bear = lastE9 != null && lastE21 != null && lastE50 != null && lastE9 < lastE21 && (last?.close ?? 0) < lastE50;
  const entrySignal = bull ? "EMA9 > EMA21 · Price above EMA50 (bullish)"
    : bear ? "EMA9 < EMA21 · Price below EMA50 (bearish)"
    : "No clear structure";

  // Position box (auto)
  const atr = useMemo(() => {
    const n = 14;
    const window = bars.slice(-n - 1);
    if (window.length < 2) return 0;
    let s = 0; let count = 0;
    for (let i = 1; i < window.length; i++) {
      const tr = Math.max(
        window[i].high - window[i].low,
        Math.abs(window[i].high - window[i - 1].close),
        Math.abs(window[i].low - window[i - 1].close),
      );
      s += tr; count++;
    }
    return count ? s / count : 0;
  }, [bars]);
  const direction: "LONG" | "SHORT" = bear ? "SHORT" : "LONG";
  const entry = price;
  const stop = direction === "LONG" ? price - atr * 1.2 : price + atr * 1.2;
  const tp = direction === "LONG" ? price + atr * 2.4 : price - atr * 2.4;
  const rr = atr ? Math.abs(tp - entry) / Math.max(Math.abs(entry - stop), 0.0001) : 0;

  const d = inst.priceDecimals ?? 2;
  const fmt = (n: number) => currencySymbol + n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="space-y-4">
      {/* Instrument selector */}
      <div className="flex flex-wrap items-center gap-2">
        {instruments.map((i) => (
          <button
            key={i.key}
            onClick={() => setSymbolKey(i.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              i.key === symbolKey
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface/50 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {i.label}
          </button>
        ))}
      </div>

      {/* Price panel */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{inst.yahoo}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{inst.label}</h2>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-semibold tabular-nums">{fmt(price)}</p>
            <p className={`mt-1 inline-flex items-center gap-1 text-sm font-medium ${up ? "text-success" : "text-destructive"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {up ? "+" : ""}{change.toFixed(d)} ({up ? "+" : ""}{pct.toFixed(2)}%)
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Active setup · <span className="font-medium text-foreground">{inst.label}</span> · Direction{" "}
          <span className={direction === "LONG" ? "text-success" : "text-destructive"}>{direction}</span>
        </p>
      </div>

      {/* Timeframe + indicator toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 p-3">
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                t === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
          {loading && <RefreshCw className="ml-3 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {([
            ["ema9", "EMA 9", "#60a5fa"],
            ["ema21", "EMA 21", "#f59e0b"],
            ["ema50", "EMA 50", "#a78bfa"],
            ["bb", "BB(20)", "#94a3b8"],
            ["vwap", "VWAP", "#e7a92a"],
            ["volume", "Volume", "#22c55e"],
          ] as const).map(([k, label, color]) => (
            <button
              key={k}
              onClick={() => setToggles((s) => ({ ...s, [k]: !s[k] }))}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition ${
                toggles[k]
                  ? "border-border bg-background text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <Suspense fallback={<div className="h-[420px] rounded-xl border border-border bg-surface/40" />}>
        <ClientChart bars={bars} toggles={toggles} />
      </Suspense>

      {/* Signal + Position boxes */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" /> Signal
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entry Signal</span>
              <span className={`text-right font-medium ${bull ? "text-success" : bear ? "text-destructive" : "text-foreground"}`}>{entrySignal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RSI(14)</span>
              <span className={`font-semibold tabular-nums ${
                lastRsi == null ? "" : lastRsi > 70 ? "text-destructive" : lastRsi < 30 ? "text-success" : "text-foreground"
              }`}>
                {lastRsi == null ? "—" : lastRsi.toFixed(1)}
                {lastRsi != null && lastRsi > 70 && " · Overbought"}
                {lastRsi != null && lastRsi < 30 && " · Oversold"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Candle body</span>
              <span className="font-semibold tabular-nums">{bodyPct}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Trading Position</div>
            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
              <Lock className="h-3 w-3" /> LOCKED
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Direction" value={direction} accent={direction === "LONG" ? "success" : "destructive"} />
            <Stat label="R:R" value={`1:${rr.toFixed(2)}`} />
            <Stat label="Entry" value={fmt(entry)} accent="primary" />
            <Stat label="Take Profit" value={fmt(tp)} accent="success" />
            <Stat label="Stop Loss" value={fmt(stop)} accent="destructive" />
            <Stat label="ATR(14)" value={atr.toFixed(d)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "success" | "destructive" | "primary" }) {
  const color =
    accent === "success" ? "text-success" :
    accent === "destructive" ? "text-destructive" :
    accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
