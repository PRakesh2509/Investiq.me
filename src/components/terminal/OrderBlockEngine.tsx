import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Maximize2,
  Minimize2,
  Moon,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  ShieldAlert,
  Sun,
  Volume2,
} from "lucide-react";
import {
  getOrderBlockData,
  INSTRUMENT_CONFIGS,
  type OrderBlockData,
  type OptionStrikeRow,
} from "@/lib/orderblock.functions";
import { getBars, type Bar } from "@/lib/terminal.functions";
import { ema, vwap } from "@/lib/indicators";
import TradingChart from "./TradingChart";

const TIMEFRAMES = ["1M", "3M", "5M", "15M", "30M", "1H", "1D"] as const;
type TF = (typeof TIMEFRAMES)[number];

const NSE_TABS = ["NIFTY 50", "BANK NIFTY", "FIN NIFTY", "SENSEX", "MIDCAP NIFTY"] as const;
const GLOBAL_TABS = ["S&P 500", "NASDAQ 100", "DOW JONES"] as const;

export default function OrderBlockEngine() {
  const [instrument, setInstrument] = useState<string>("NIFTY 50");
  const [tf, setTf] = useState<TF>("1M");
  const [chartType, setChartType] = useState<"CANDLES" | "LINE">("CANDLES");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tickCount, setTickCount] = useState<number>(0);
  const [candleCountdown, setCandleCountdown] = useState<string>("2:09");

  // Indicator Toggles
  const [toggles, setToggles] = useState({
    ema9: true,
    ema21: true,
    vwap: true,
    supertrend: true,
    volume: true,
  });

  // Calculator State
  const [tradingCapital, setTradingCapital] = useState<number>(30000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [manualLots, setManualLots] = useState<number>(10);
  const [customPremium, setCustomPremium] = useState<string>("137.18");
  const [selectedContract, setSelectedContract] = useState<string>("NIFTY50 22850 PE");

  // Server functions
  const fetchOrderBlock = useServerFn(getOrderBlockData);
  const fetchBars = useServerFn(getBars);

  const [data, setData] = useState<OrderBlockData | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Load orderblock & bars
  const loadData = async (inst: string, currentTf: TF) => {
    setIsRefreshing(true);
    try {
      const cfg = INSTRUMENT_CONFIGS[inst] ?? INSTRUMENT_CONFIGS["NIFTY 50"];
      const [obRes, barRes] = await Promise.all([
        fetchOrderBlock({ data: { instrument: inst } }),
        fetchBars({ data: { symbol: cfg.yahooSymbol, timeframe: currentTf } }),
      ]);
      if (obRes?.ok) {
        setData(obRes);
        if (!selectedContract.startsWith(obRes.name.replace(/[^A-Z0-9]/g, ""))) {
          setSelectedContract(obRes.contractName);
          setCustomPremium(obRes.recommendedPremium.toFixed(2));
        }
      }
      if (barRes?.ok && barRes.bars.length > 0) {
        setBars(barRes.bars);
      }
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(instrument, tf);
    const interval = setInterval(() => {
      loadData(instrument, tf);
      setTickCount(0);
    }, 15000);
    return () => clearInterval(interval);
  }, [instrument, tf]);

  // Tick update counter & candle countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTickCount((prev) => prev + 1);
      const now = new Date();
      const remSec = 60 - (now.getSeconds() % 60);
      const m = Math.floor(remSec / 60);
      const s = String(remSec % 60).padStart(2, "0");
      setCandleCountdown(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const cfg = INSTRUMENT_CONFIGS[instrument] ?? INSTRUMENT_CONFIGS["NIFTY 50"];
  const curSymbol = cfg.currency;

  // OHLC bar derived from latest bar or fallback
  const lastBar = bars[bars.length - 1];
  const ohlc = useMemo(() => {
    if (lastBar) {
      return {
        o: lastBar.open.toFixed(2),
        h: lastBar.high.toFixed(2),
        l: lastBar.low.toFixed(2),
        c: lastBar.close.toFixed(2),
        vol: lastBar.volume.toLocaleString("en-IN"),
      };
    }
    return {
      o: (data?.open ?? 24521.81).toFixed(2),
      h: (data?.high ?? 24548.2).toFixed(2),
      l: (data?.low ?? 24505.7).toFixed(2),
      c: (data?.spotPrice ?? 24510.22).toFixed(2),
      vol: (data?.volume ?? 27123).toLocaleString("en-IN"),
    };
  }, [lastBar, data]);

  // Calculator calculations
  const premium = parseFloat(customPremium) || (data?.recommendedPremium ?? 137.18);
  const lotSize = cfg.lotSize;
  const totalQty = manualLots * lotSize;
  const capitalInvested = Math.round(totalQty * premium);
  const maxLoss = Math.round(capitalInvested * 0.2); // -20% stop loss
  const lossPct = tradingCapital > 0 ? ((maxLoss / tradingCapital) * 100).toFixed(1) : "0.0";
  const tp1Profit = Math.round(totalQty * 0.5 * premium * 0.25); // +1.5R on 50% lots
  const tp2Profit = Math.round(totalQty * 0.75 * premium * 0.5); // +2.5R on 75% lots
  const tp3Profit = Math.round(totalQty * premium * 0.76); // >3.5R on 100% lots

  const maxBudget = Math.round(tradingCapital * (riskPct / 100));

  const handleSelectStrike = (strike: number, type: "CE" | "PE", ltp: number) => {
    const clean = instrument.replace(/[^A-Z0-9]/g, "");
    setSelectedContract(`${clean} ${strike} ${type}`);
    setCustomPremium(ltp.toFixed(2));
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen w-full transition-colors duration-200 ${
        isDark ? "bg-[#090a0f] text-[#f1f5f9]" : "bg-slate-50 text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-[1680px] p-3 space-y-3 sm:p-5">
        {/* Top Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2430] pb-3">
          <div className="flex items-center gap-3">
            <Link
              to="/desktop"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e2430] bg-[#12151e]/80 px-3 py-1.5 text-xs font-semibold tracking-wider text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <span>&larr;</span> EXECUTIVE HOME
            </Link>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              ORDER BLOCK ENGINE
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-sm bg-emerald-500 animate-pulse" />
              NSE LIVE
            </span>
            <span className="font-mono text-slate-400">
              TICK UPDATE: <strong className="text-slate-200">{tickCount}s</strong>
            </span>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="inline-flex items-center gap-1 rounded-md border border-[#1e2430] bg-[#12151e] px-2.5 py-1 text-slate-300 hover:bg-slate-800"
            >
              {isDark ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-slate-400" />}
              <span className="uppercase text-[11px] font-semibold">{isDark ? "LIGHT" : "DARK"}</span>
            </button>
          </div>
        </header>

        {/* Index Selector Sub-Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e2430] bg-[#0e111a]/90 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase text-slate-400">NSE F&amp;O:</span>
            {NSE_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setInstrument(t)}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  instrument === t
                    ? "bg-slate-200 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[#1e2430] pt-2 sm:border-t-0 sm:pt-0">
            <span className="font-mono text-[11px] font-bold uppercase text-slate-400">GLOBAL:</span>
            {GLOBAL_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setInstrument(t)}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  instrument === t
                    ? "bg-slate-200 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Hero Header Section */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {instrument}
              </h1>
              <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-300">
                {cfg.tag}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-slate-400">
              MULTI-PIVOT CONFLUENCE &amp; INSTITUTIONAL OPTION ORDERFLOW ENGINE
            </p>
          </div>

          <div className="text-right">
            <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {curSymbol}
              {(data?.spotPrice ?? 22862.9).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
            </div>
            <p
              className={`font-mono text-xs font-semibold ${
                (data?.change ?? -2.05) >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {(data?.change ?? -2.05) >= 0 ? "▲ +" : "▼ "}
              {(data?.change ?? -2.05).toFixed(2)} (
              {(data?.changePct ?? -0.01) >= 0 ? "+" : ""}
              {(data?.changePct ?? -0.01).toFixed(2)}%)
            </p>
          </div>
        </div>

        {/* Primary High-Confluence Trade Alert Banner */}
        <section className="relative overflow-hidden rounded-xl border border-rose-900/50 bg-[#140b0f]/80 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-950/80 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/20 text-rose-500">
                {data?.direction === "CALL" ? (
                  <ArrowUp className="h-4 w-4 stroke-[3]" />
                ) : (
                  <ArrowDown className="h-4 w-4 stroke-[3]" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-sm sm:text-base font-extrabold uppercase tracking-wide text-rose-400">
                    {data?.actionText ?? `BUY ${instrument} PUT`}
                  </h2>
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    {data?.grade ?? "A+ CONFLUENCE"}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400">
                  {data?.rationale ?? "EMA9<EMA21 crossdown · RSI 44"}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
              <Shield className="h-3.5 w-3.5 text-cyan-400" />
              <span>DhanHQ Colocation Feed Ready</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">CONTRACT</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-white truncate">
                {data?.contractName ?? `${instrument.replace(/[^A-Z0-9]/g, "")} 22850 PE`}
              </p>
            </div>
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">INDEX SPOT ENTRY</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-white">
                {(data?.spotEntry ?? 22862.9).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">REC. OPTION PREMIUM</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
                {curSymbol}{(data?.recommendedPremium ?? 137.18).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">OPTION TP1 (1.5R)</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
                {curSymbol}{(data?.tp1 ?? 170.94).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">OPTION TP2 (2.5R)</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
                {curSymbol}{(data?.tp2 ?? 205.78).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">OPTION STOP LOSS</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-rose-400">
                {curSymbol}{(data?.stopLoss ?? 109.74).toFixed(2)}
              </p>
            </div>
          </div>
        </section>

        {/* Main Two-Column Section: Chart (Left) + Calculator & Trailing SL (Right) */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Left Column: Live Chart & Indicators (~62% / 7.5 cols on 12-col grid) */}
          <div className="space-y-3 xl:col-span-7">
            <div className="rounded-xl border border-[#1e2430] bg-[#0c0e16] p-3 shadow-md">
              {/* Chart Title & Top Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2430] pb-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{cfg.name}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                    {cfg.tag}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                  <span className="text-slate-400 text-[11px]">{tf} Candle</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
                    <Clock className="h-3 w-3 text-slate-500" />
                    {candleCountdown}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white">
                    {curSymbol}
                    {(data?.spotPrice ?? 22862.9).toFixed(2)}
                  </span>
                  <span
                    className={`font-mono text-[11px] ${
                      (data?.change ?? -2.05) >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {(data?.change ?? -2.05) >= 0 ? "+" : ""}
                    {(data?.change ?? -2.05).toFixed(2)} (
                    {(data?.changePct ?? -0.01).toFixed(2)}%)
                  </span>
                  <button
                    onClick={() => loadData(instrument, tf)}
                    className="p-1 text-slate-400 hover:text-white"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Timeframes & Indicators Bar */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Timeframes */}
                <div className="flex items-center gap-1">
                  {TIMEFRAMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTf(t)}
                      className={`rounded px-2 py-0.5 text-[11px] font-mono font-medium transition ${
                        tf === t ? "bg-slate-200 text-slate-950 font-bold" : "text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  <div className="ml-2 flex rounded border border-slate-800 bg-slate-900/60 p-0.5">
                    <button
                      onClick={() => setChartType("CANDLES")}
                      className={`px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        chartType === "CANDLES" ? "bg-slate-800 text-white" : "text-slate-400"
                      }`}
                    >
                      CANDLES
                    </button>
                    <button
                      onClick={() => setChartType("LINE")}
                      className={`px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        chartType === "LINE" ? "bg-slate-800 text-white" : "text-slate-400"
                      }`}
                    >
                      LINE
                    </button>
                  </div>
                </div>

                {/* Indicators */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-mono text-[10px] text-slate-500">INDICATORS:</span>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, ema9: !p.ema9 }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.ema9 ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "text-slate-500 border border-transparent"
                    }`}
                  >
                    EMA 9
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, ema21: !p.ema21 }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.ema21 ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "text-slate-500 border border-transparent"
                    }`}
                  >
                    EMA 21
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, vwap: !p.vwap }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.vwap ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40" : "text-slate-500 border border-transparent"
                    }`}
                  >
                    VWAP
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, supertrend: !p.supertrend }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.supertrend ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "text-slate-500 border border-transparent"
                    }`}
                  >
                    SUPERTREND
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, volume: !p.volume }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.volume ? "bg-purple-500/20 text-purple-400 border border-purple-500/40" : "text-slate-500 border border-transparent"
                    }`}
                  >
                    Volume
                  </button>
                </div>
              </div>

              {/* Action Tools & OHLC Row */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#1e2430] pt-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-teal-500/15 border border-teal-500/40 px-2 py-0.5 font-mono font-bold text-teal-400 text-[10px]">
                    SETUP TOOL ACTIVE
                  </span>
                  <button className="inline-flex items-center gap-1 rounded border border-slate-700/60 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-800">
                    <Settings className="h-3 w-3 text-slate-400" />
                    ADJUST LEVELS ⚙
                  </button>
                </div>

                <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400">
                  <span>O: <strong className="text-slate-200">{ohlc.o}</strong></span>
                  <span>H: <strong className="text-slate-200">{ohlc.h}</strong></span>
                  <span>L: <strong className="text-slate-200">{ohlc.l}</strong></span>
                  <span>C: <strong className="text-slate-200">{ohlc.c}</strong></span>
                  <span>Vol: <strong className="text-slate-200">{ohlc.vol}</strong></span>
                </div>
              </div>

              {/* Candlestick Chart Area with Setup Box Overlay */}
              <div className="relative mt-2 h-[480px] w-full overflow-hidden rounded-lg border border-[#1e2430] bg-[#07090e]">
                {bars.length > 0 ? (
                  <TradingChart
                    bars={bars}
                    toggles={{
                      ema9: toggles.ema9,
                      ema21: toggles.ema21,
                      ema50: false,
                      bb: false,
                      vwap: toggles.vwap,
                      volume: toggles.volume,
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-xs text-slate-500">
                    Connecting live {instrument} feed…
                  </div>
                )}

                {/* Interactive Setup Overlay (exact reproduction from screenshot) */}
                <div className="pointer-events-none absolute top-3 right-3 rounded-lg border border-slate-800/80 bg-slate-950/85 p-3 text-[11px] font-mono shadow-2xl backdrop-blur">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-1.5">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      LONG SETUP (1:1.50 R:R)
                    </div>
                    <div className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                      ▲ STOPPED OUT: ₹24860.54
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
                    <div>Risk (-SL): <strong className="text-rose-400">-₹8,11,425</strong></div>
                    <div>Reward (+TP2): <strong className="text-emerald-400">+₹6,11,425</strong></div>
                    <div>Live Est. MTM: <strong className="text-rose-400">-₹5,11,625</strong></div>
                    <div>Locked Profit: <strong className="text-emerald-400">+₹0 (100% Banked)</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Option Premium Calculator & Trailing SL Engine (~38% / 5 cols) */}
          <div className="space-y-3 xl:col-span-5">
            {/* Calculator Card */}
            <div className="rounded-xl border border-[#1e2430] bg-[#0c0e16] p-4 shadow-md text-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#1e2430] pb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                    OPTION PREMIUM CALCULATOR
                  </h3>
                </div>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                  {instrument}
                </span>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                    TRADING CAPITAL (₹):
                  </label>
                  <input
                    type="number"
                    value={tradingCapital}
                    onChange={(e) => setTradingCapital(Math.max(1000, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 font-mono text-xs font-bold text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                    MAX RISK / TRADE:
                  </label>
                  <div className="mt-1 flex gap-1">
                    {[1, 1.5, 2].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRiskPct(r)}
                        className={`flex-1 rounded py-1.5 font-mono text-xs font-bold transition ${
                          riskPct === r
                            ? "bg-slate-200 text-slate-950"
                            : "border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Budget & Recommendation */}
              <div className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/40 p-2.5 text-[11px] font-mono">
                <div>
                  <p className="text-slate-400">MAX BUDGET ({riskPct}% OF ₹{tradingCapital.toLocaleString("en-IN")}):</p>
                  <p className="font-bold text-white">₹{maxBudget.toLocaleString("en-IN")}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-slate-500">RECOMMENDED:</p>
                  <p className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    USE 1 LOT(S) ({lotSize} QTY)
                  </p>
                </div>
              </div>

              {/* Manual Lots Selector */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                  MANUAL LOTS SELECTOR:
                </p>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {[1, 2, 4, 10].map((l) => (
                    <button
                      key={l}
                      onClick={() => setManualLots(l)}
                      className={`rounded py-1.5 font-mono text-xs font-bold transition ${
                        manualLots === l
                          ? "bg-white text-slate-950 shadow"
                          : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {l} Lot{l > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Option Premium Input */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                  CUSTOM OPTION PREMIUM (₹):
                </label>
                <input
                  type="text"
                  value={customPremium}
                  onChange={(e) => setCustomPremium(e.target.value)}
                  placeholder={`Current Est: ₹${(data?.recommendedPremium ?? 137.18).toFixed(2)}`}
                  className="mt-1 w-full rounded border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 font-mono text-xs font-bold text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Calculated Outputs Table */}
              <div className="space-y-1.5 rounded-lg border border-slate-800/80 bg-black/40 p-3 font-mono text-[11px]">
                <div className="flex justify-between border-b border-slate-800/60 pb-1 text-slate-300">
                  <span className="text-slate-400">SELECTED CONTRACT:</span>
                  <span className="font-bold text-white">{selectedContract}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1 text-slate-300">
                  <span className="text-slate-400">TOTAL QUANTITY:</span>
                  <span className="font-semibold text-white">
                    {totalQty} Qty ({manualLots} &times; {lotSize})
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1 text-slate-300">
                  <span className="text-slate-400">CAPITAL INVESTED:</span>
                  <span className="font-bold text-white">₹{capitalInvested.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1">
                  <span className="text-slate-400">MAX DOWNSIDE LOSS (-20% SL):</span>
                  <span className="font-bold text-rose-400">
                    -₹{maxLoss.toLocaleString("en-IN")} ({lossPct}% of Capital)
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1">
                  <span className="text-slate-400">PROFIT LOCKED AT TP1 (+1.5R):</span>
                  <span className="font-bold text-emerald-400">
                    +₹{tp1Profit.toLocaleString("en-IN")} (50% Qty)
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1">
                  <span className="text-slate-400">TARGET RETURN AT TP2 (+2.5R):</span>
                  <span className="font-bold text-emerald-400">
                    +₹{tp2Profit.toLocaleString("en-IN")} (75% Qty)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">HERO RUNNER AT TP3 (&gt;3.5R):</span>
                  <span className="font-bold text-emerald-400">
                    +₹{tp3Profit.toLocaleString("en-IN")} (100% Qty)
                  </span>
                </div>
              </div>

              {/* Dynamic Trailing SL Engine Sub-Card */}
              <div className="rounded-lg border border-slate-800 bg-[#0e111a] p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-slate-200">
                    <span>⚡</span> DYNAMIC TRAILING SL ENGINE:
                  </div>
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400">
                    ■ STOPPED OUT: ₹{(data?.stopLoss ?? 109.74).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500">ACTIVE TRAILING SL:</p>
                    <p className="font-bold text-rose-400">₹{(data?.stopLoss ?? 109.74).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500">PEAK WATERMARK LTP:</p>
                    <p className="font-bold text-amber-400">₹{premium.toFixed(2)}</p>
                  </div>
                </div>

                <div className="border-t border-slate-800/60 pt-1 text-[11px] font-mono text-slate-300">
                  <span className="text-slate-500">EXECUTION STATE: </span>
                  <span className="text-rose-400 font-semibold">
                    🚨 Trailing SL hit at ₹{(data?.stopLoss ?? 109.74).toFixed(2)}
                  </span>
                </div>

                <div className="rounded bg-slate-900/60 p-2 text-[10px] text-slate-400 leading-relaxed border border-slate-800/40">
                  <strong className="text-cyan-400">🛡️ REVERSAL PROTECTION ACTIVE:</strong> When price hits TP1 (+1.5R),
                  sell 50% lots and move SL to entry (breakeven). If market reverses, your loss is ₹0 and you keep the 50% profit.
                </div>
              </div>

              {/* Execution Management Rules */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[10px] text-slate-400 space-y-1.5 leading-relaxed">
                <p className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                  <span>📋</span> EXECUTION MANAGEMENT RULES
                </p>
                <p>
                  • <strong className="text-slate-200">Max 20% Option SL Cap:</strong> Hard stop-loss on option premium
                  (capped at max 20% loss) eliminates huge option decay drawdowns.
                </p>
                <p>
                  • <strong className="text-slate-200">TP1 Target (1.5R):</strong> Lock 50% lot profit &amp;
                  automatically shift SL to breakeven.
                </p>
                <p>
                  • <strong className="text-slate-200">TP2 Target (2.5R):</strong> Runner position target for maximum
                  Risk:Reward.
                </p>
                <p>
                  • <strong className="text-slate-200">Auto Square-off:</strong> Exit intraday positions before 03:15 PM IST.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Live Option Chain (Strikes & Premiums) */}
        <section className="rounded-xl border border-[#1e2430] bg-[#0c0e16] p-4 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2430] pb-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔗</span>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-white">
                LIVE OPTION CHAIN ({instrument} — STRIKES &amp; PREMIUMS)
              </h3>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                MODEL ESTIMATE
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadData(instrument, tf)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-[11px] font-mono font-medium text-slate-300 hover:bg-slate-800"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                REFRESH QUOTES
              </button>
              <span className="font-mono text-[11px] text-slate-400">
                Step: {cfg.step} pts · Lot Size: {cfg.lotSize} Qty
              </span>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-center font-mono text-xs">
              <thead>
                <tr className="border-b border-[#1e2430] text-[10px] uppercase tracking-wider text-slate-400 bg-slate-950/40">
                  <th className="py-2.5 px-3 text-left">CALL LTP (₹)</th>
                  <th className="py-2.5 px-3">CALL TYPE</th>
                  <th className="py-2.5 px-3 font-bold text-white">STRIKE PRICE</th>
                  <th className="py-2.5 px-3">PUT TYPE</th>
                  <th className="py-2.5 px-3 text-right">PUT LTP (₹)</th>
                  <th className="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2430]/60">
                {(data?.strikes ?? []).map((row) => (
                  <tr key={row.strike} className="hover:bg-slate-900/40 transition">
                    <td className="py-2 px-3 text-left font-bold text-emerald-400">
                      ₹{row.callLtp.toFixed(2)}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          row.callType === "ITM"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : row.callType === "ATM"
                            ? "bg-white text-slate-950"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {row.callType}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold text-white text-sm">
                      {row.strike} {row.callType === "ATM" || row.putType === "ATM" ? "(ATM)" : ""}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          row.putType === "ITM"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : row.putType === "ATM"
                            ? "bg-white text-slate-950"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {row.putType}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-rose-400">
                      ₹{row.putLtp.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => handleSelectStrike(row.strike, "CE", row.callLtp)}
                          className="rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 hover:bg-emerald-500/20"
                        >
                          CALC CE
                        </button>
                        <button
                          onClick={() => handleSelectStrike(row.strike, "PE", row.putLtp)}
                          className="rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400 hover:bg-rose-500/20"
                        >
                          CALC PE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Confluence Signals Grid */}
        <section className="rounded-xl border border-[#1e2430] bg-[#0c0e16] p-4 shadow-md text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e2430] pb-2">
            <div className="flex items-center gap-2">
              <span>⚙</span>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-white">
                RECENT CONFLUENCE SIGNALS
              </h3>
            </div>
            <span className="font-mono text-[11px] text-slate-400">Showing last 6 setups</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(data?.recentSignals ?? []).map((sig) => {
              const isPe = sig.type.includes("PE");
              return (
                <div
                  key={sig.id}
                  className="rounded-lg border border-[#1e2430] bg-[#080a10] p-3 font-mono space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-extrabold ${
                        isPe ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      }`}
                    >
                      {sig.type} {isPe ? "▼" : "▲"}
                    </span>
                    <span className="text-[10px] text-slate-500">{sig.timeStr}</span>
                  </div>

                  <div>
                    <p className="font-bold text-white text-sm">
                      Spot @ {sig.spot.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{sig.rationale}</p>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[10px]">
                    <span className="text-emerald-400 font-semibold">TARGET: {sig.target.toFixed(2)}</span>
                    <span className="text-rose-400 font-semibold">STOP: {sig.stop.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#1e2430] pt-4 pb-8 text-center text-[10px] font-mono uppercase tracking-widest text-slate-500">
          INSTITUTIONAL TRADING ENGINE LOGIC. EDUCATIONAL &amp; RESEARCH SIGNALS. TRADE RESPONSIBLY.
        </footer>
      </div>
    </div>
  );
}
