import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Moon,
  RefreshCw,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import {
  computeOrderBlock,
  getOrderBlockData,
  INSTRUMENT_CONFIGS,
  type OrderBlockData,
} from "@/lib/orderblock.functions";

const TIMEFRAMES = ["1M", "3M", "5M", "15M", "30M", "1H", "1D"] as const;
type TF = (typeof TIMEFRAMES)[number];

const TV_INTERVAL_MAP: Record<TF, string> = {
  "1M": "1",
  "3M": "3",
  "5M": "5",
  "15M": "15",
  "30M": "30",
  "1H": "60",
  "1D": "D",
};

const NSE_TABS = ["NIFTY 50", "BANK NIFTY", "FIN NIFTY", "SENSEX", "MIDCAP NIFTY"] as const;
const GLOBAL_TABS = ["S&P 500", "NASDAQ 100", "DOW JONES"] as const;

export default function OrderBlockEngine() {
  const [instrument, setInstrument] = useState<string>("NIFTY 50");
  const [tf, setTf] = useState<TF>("1M");
  const [chartType, setChartType] = useState<"CANDLES" | "LINE">("CANDLES");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tickCount, setTickCount] = useState<number>(0);

  // Indicator Toggles (visual state retained for UI/UX matching screenshot)
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

  // Initial state is synchronously populated so tables & metrics are never blank
  const [data, setData] = useState<OrderBlockData>(() => computeOrderBlock("NIFTY 50"));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Active instrument config
  const cfg = INSTRUMENT_CONFIGS[instrument] ?? INSTRUMENT_CONFIGS["NIFTY 50"];
  const curSymbol = cfg.currency;
  const tvSymbol = cfg.tvSymbol ?? "NSE:NIFTY";
  const tvInterval = TV_INTERVAL_MAP[tf] ?? "1";

  // Load live orderblock data
  const loadData = async (inst: string) => {
    setIsRefreshing(true);
    try {
      const obRes = await fetchOrderBlock({ data: { instrument: inst } });
      if (obRes?.ok) {
        setData(obRes);
        const cleanInst = inst.replace(/[^A-Z0-9]/g, "");
        if (!selectedContract.startsWith(cleanInst)) {
          setSelectedContract(obRes.contractName);
          setCustomPremium(obRes.recommendedPremium.toFixed(2));
        }
      }
    } catch {
      // Fallback: update with synchronous calculation
      setData((prev) => computeOrderBlock(inst, prev?.spotPrice));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // When instrument changes, update contract and premium immediately
    const cleanInst = instrument.replace(/[^A-Z0-9]/g, "");
    const initialForInst = computeOrderBlock(instrument);
    setData(initialForInst);
    setSelectedContract(initialForInst.contractName);
    setCustomPremium(initialForInst.recommendedPremium.toFixed(2));

    loadData(instrument);
    const interval = setInterval(() => {
      loadData(instrument);
      setTickCount(0);
    }, 15000);
    return () => clearInterval(interval);
  }, [instrument]);

  // Tick update counter
  useEffect(() => {
    const timer = setInterval(() => {
      setTickCount((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // OHLC bar derived from data
  const ohlc = useMemo(() => {
    return {
      o: (data?.open ?? 24521.81).toFixed(2),
      h: (data?.high ?? 24548.2).toFixed(2),
      l: (data?.low ?? 24505.7).toFixed(2),
      c: (data?.spotPrice ?? 24510.22).toFixed(2),
      vol: (data?.volume ?? 27123).toLocaleString("en-IN"),
    };
  }, [data]);

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
    <div className="min-h-screen w-full bg-hero text-foreground">
      <div className="mx-auto max-w-[1680px] p-3 space-y-4 sm:p-6">
        {/* Top Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3 backdrop-blur shadow-sm">
          <div className="flex items-center gap-3">
            <Link
              to="/desktop"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <span>&larr;</span> EXECUTIVE HOME
            </Link>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary shadow-glow">
              ORDER BLOCK ENGINE
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-sm bg-emerald-500 animate-pulse" />
              NSE LIVE
            </span>
            <span className="font-mono text-muted-foreground">
              TICK UPDATE: <strong className="text-foreground">{tickCount}s</strong>
            </span>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/60 px-2.5 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {isDark ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="uppercase text-[11px] font-semibold">{isDark ? "LIGHT" : "DARK"}</span>
            </button>
          </div>
        </header>

        {/* Index Selector Sub-Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-xs backdrop-blur shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">NSE F&amp;O:</span>
            {NSE_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setInstrument(t)}
                className={`rounded-lg px-3 py-1 font-medium transition ${
                  instrument === t
                    ? "bg-gradient-primary text-primary-foreground font-bold shadow-glow"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
            <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">GLOBAL:</span>
            {GLOBAL_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setInstrument(t)}
                className={`rounded-lg px-3 py-1 font-medium transition ${
                  instrument === t
                    ? "bg-gradient-primary text-primary-foreground font-bold shadow-glow"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Hero Header Section */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pt-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {instrument}
              </h1>
              <span className="rounded-md border border-border bg-surface/80 px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
                {cfg.tag}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              MULTI-PIVOT CONFLUENCE &amp; INSTITUTIONAL OPTION ORDERFLOW ENGINE
            </p>
          </div>

          <div className="text-right">
            <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {curSymbol}
              {(data?.spotPrice ?? 22862.9).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
            </div>
            <p
              className={`font-mono text-xs font-semibold ${
                (data?.change ?? -2.05) >= 0 ? "text-success" : "text-destructive"
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
        <section
          className={`relative overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur ${
            data?.direction === "CALL"
              ? "border-emerald-500/30 bg-emerald-950/20"
              : "border-rose-500/30 bg-rose-950/20"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                  data?.direction === "CALL"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/20 text-rose-400"
                }`}
              >
                {data?.direction === "CALL" ? (
                  <ArrowUp className="h-4 w-4 stroke-[3]" />
                ) : (
                  <ArrowDown className="h-4 w-4 stroke-[3]" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    className={`font-mono text-sm sm:text-base font-extrabold uppercase tracking-wide ${
                      data?.direction === "CALL" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {data?.actionText ?? `BUY ${instrument} PUT`}
                  </h2>
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    {data?.grade ?? "A+ CONFLUENCE"}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  {data?.rationale ?? "EMA9<EMA21 crossdown · RSI 44"}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span>DhanHQ Colocation Feed Ready</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
            <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">CONTRACT</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-foreground truncate">
                {data?.contractName ?? `${instrument.replace(/[^A-Z0-9]/g, "")} 22850 PE`}
              </p>
            </div>
            <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">INDEX SPOT ENTRY</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-foreground">
                {(data?.spotEntry ?? 22862.9).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">REC. OPTION PREMIUM</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
                {curSymbol}{(data?.recommendedPremium ?? 137.18).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">OPTION TP1 (1.5R)</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
                {curSymbol}{(data?.tp1 ?? 170.94).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">OPTION TP2 (2.5R)</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-400">
                {curSymbol}{(data?.tp2 ?? 205.78).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-background/50 p-2.5 border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">OPTION STOP LOSS</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-rose-400">
                {curSymbol}{(data?.stopLoss ?? 109.74).toFixed(2)}
              </p>
            </div>
          </div>
        </section>

        {/* 2-Column Workstation Grid */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Left Column: Live TradingView Graph & Toolbar (~62% / 7 cols) */}
          <div className="space-y-3 xl:col-span-7">
            {/* Chart Toolbar Card */}
            <div className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{cfg.name}</span>
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
                    {cfg.tag}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                  <span className="text-muted-foreground text-[11px]">{tf} Candle</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    2:09
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground">
                    {curSymbol}{(data?.spotPrice ?? 22862.9).toFixed(2)}
                  </span>
                  <span
                    className={`font-mono text-[11px] ${
                      (data?.change ?? -2.05) >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {(data?.change ?? -2.05) >= 0 ? "+" : ""}
                    {(data?.change ?? -2.05).toFixed(2)} (
                    {(data?.changePct ?? -0.01) >= 0 ? "+" : ""}
                    {(data?.changePct ?? -0.01).toFixed(2)}%)
                  </span>
                  <button
                    onClick={() => loadData(instrument)}
                    className="p-1 text-muted-foreground hover:text-foreground transition"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Timeframes & Indicators Bar */}
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
                  <div className="ml-2 flex rounded-lg border border-border bg-background/50 p-0.5">
                    <button
                      onClick={() => setChartType("CANDLES")}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase transition ${
                        chartType === "CANDLES" ? "bg-accent text-foreground shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      CANDLES
                    </button>
                    <button
                      onClick={() => setChartType("LINE")}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase transition ${
                        chartType === "LINE" ? "bg-accent text-foreground shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      LINE
                    </button>
                  </div>
                </div>

                {/* Indicators (visual state retained for UI/UX matching screenshot) */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-mono text-[10px] text-muted-foreground">INDICATORS:</span>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, ema9: !p.ema9 }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.ema9 ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/40" : "text-muted-foreground border border-transparent"
                    }`}
                  >
                    EMA 9
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, ema21: !p.ema21 }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.ema21 ? "bg-amber-500/15 text-amber-400 border border-amber-500/40" : "text-muted-foreground border border-transparent"
                    }`}
                  >
                    EMA 21
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, vwap: !p.vwap }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.vwap ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/40" : "text-muted-foreground border border-transparent"
                    }`}
                  >
                    VWAP
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, supertrend: !p.supertrend }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.supertrend ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40" : "text-muted-foreground border border-transparent"
                    }`}
                  >
                    SUPERTREND
                  </button>
                  <button
                    onClick={() => setToggles((p) => ({ ...p, volume: !p.volume }))}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                      toggles.volume ? "bg-purple-500/15 text-purple-400 border border-purple-500/40" : "text-muted-foreground border border-transparent"
                    }`}
                  >
                    Volume
                  </button>
                </div>
              </div>

              {/* Action Tools & OHLC Row */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-teal-500/15 border border-teal-500/40 px-2 py-0.5 font-mono font-bold text-teal-400 text-[10px]">
                    SETUP TOOL ACTIVE
                  </span>
                  <button className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition">
                    <Settings className="h-3 w-3 text-muted-foreground" />
                    ADJUST LEVELS ⚙
                  </button>
                </div>

                <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                  <span>O: <strong className="text-foreground">{ohlc.o}</strong></span>
                  <span>H: <strong className="text-foreground">{ohlc.h}</strong></span>
                  <span>L: <strong className="text-foreground">{ohlc.l}</strong></span>
                  <span>C: <strong className="text-foreground">{ohlc.c}</strong></span>
                  <span>Vol: <strong className="text-foreground">{ohlc.vol}</strong></span>
                </div>
              </div>

              {/* Live TradingView Graph Area with Interactive Setup Overlay */}
              <div className="relative mt-2 h-[480px] w-full overflow-hidden rounded-xl border border-border bg-[#0B1015] shadow-inner">
                {/* Live TradingView Interactive Chart */}
                <iframe
                  key={`tv-${tvSymbol}-${tvInterval}-${chartType}-${theme}`}
                  src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                    tvSymbol,
                  )}&interval=${tvInterval}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0b1015&theme=dark&style=${
                    chartType === "LINE" ? "2" : "1"
                  }&timezone=Asia%2FKolkata&locale=in&utm_source=investiqq.me`}
                  className="h-full w-full border-0"
                  title={`TradingView live graph for ${instrument}`}
                  loading="eager"
                  allowFullScreen
                />

                {/* Interactive Setup Overlay (exact reproduction from screenshot) */}
                <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-xl border border-border bg-background/90 p-3 text-[11px] font-mono shadow-elegant backdrop-blur">
                  <div className="flex items-center justify-between gap-4 border-b border-border pb-1.5">
                    <div className="flex items-center gap-1.5 text-primary font-bold">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      LONG SETUP (1:1.50 R:R)
                    </div>
                    <div className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                      ▲ STOPPED OUT: ₹24860.54
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
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
            <div className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur text-xs space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    OPTION PREMIUM CALCULATOR
                  </h3>
                </div>
                <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                  {instrument}
                </span>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    TRADING CAPITAL (₹):
                  </label>
                  <input
                    type="number"
                    value={tradingCapital}
                    onChange={(e) => setTradingCapital(Math.max(1000, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    MAX RISK / TRADE:
                  </label>
                  <div className="mt-1 flex gap-1">
                    {[1, 1.5, 2].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRiskPct(r)}
                        className={`flex-1 rounded-lg py-1.5 font-mono text-xs font-bold transition ${
                          riskPct === r
                            ? "bg-gradient-primary text-primary-foreground shadow-glow"
                            : "border border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Budget & Recommendation */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 p-2.5 text-[11px] font-mono">
                <div>
                  <p className="text-muted-foreground">MAX BUDGET ({riskPct}% OF ₹{tradingCapital.toLocaleString("en-IN")}):</p>
                  <p className="font-bold text-foreground">₹{maxBudget.toLocaleString("en-IN")}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground">RECOMMENDED:</p>
                  <p className="rounded bg-surface px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-border">
                    USE 1 LOT(S) ({lotSize} QTY)
                  </p>
                </div>
              </div>

              {/* Manual Lots Selector */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  MANUAL LOTS SELECTOR:
                </p>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {[1, 2, 4, 10].map((l) => (
                    <button
                      key={l}
                      onClick={() => setManualLots(l)}
                      className={`rounded-lg py-1.5 font-mono text-xs font-bold transition ${
                        manualLots === l
                          ? "bg-gradient-primary text-primary-foreground shadow-glow"
                          : "border border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {l} Lot{l > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Option Premium Input */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  CUSTOM OPTION PREMIUM (₹):
                </label>
                <input
                  type="text"
                  value={customPremium}
                  onChange={(e) => setCustomPremium(e.target.value)}
                  placeholder={`Current Est: ₹${(data?.recommendedPremium ?? 137.18).toFixed(2)}`}
                  className="mt-1 w-full rounded-lg border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-none transition"
                />
              </div>

              {/* Calculated Outputs Table */}
              <div className="space-y-1.5 rounded-xl border border-border bg-background/50 p-3 font-mono text-[11px]">
                <div className="flex justify-between border-b border-border/60 pb-1 text-muted-foreground">
                  <span className="text-muted-foreground">SELECTED CONTRACT:</span>
                  <span className="font-bold text-foreground">{selectedContract}</span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-1 text-muted-foreground">
                  <span className="text-muted-foreground">TOTAL QUANTITY:</span>
                  <span className="font-semibold text-foreground">
                    {totalQty} Qty ({manualLots} &times; {lotSize})
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-1 text-muted-foreground">
                  <span className="text-muted-foreground">CAPITAL INVESTED:</span>
                  <span className="font-bold text-foreground">₹{capitalInvested.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-1">
                  <span className="text-muted-foreground">MAX DOWNSIDE LOSS (-20% SL):</span>
                  <span className="font-bold text-rose-400">
                    -₹{maxLoss.toLocaleString("en-IN")} ({lossPct}% of Capital)
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-1">
                  <span className="text-muted-foreground">PROFIT LOCKED AT TP1 (+1.5R):</span>
                  <span className="font-bold text-emerald-400">
                    +₹{tp1Profit.toLocaleString("en-IN")} (50% Qty)
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-1">
                  <span className="text-muted-foreground">TARGET RETURN AT TP2 (+2.5R):</span>
                  <span className="font-bold text-emerald-400">
                    +₹{tp2Profit.toLocaleString("en-IN")} (75% Qty)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HERO RUNNER AT TP3 (&gt;3.5R):</span>
                  <span className="font-bold text-emerald-400">
                    +₹{tp3Profit.toLocaleString("en-IN")} (100% Qty)
                  </span>
                </div>
              </div>

              {/* Dynamic Trailing SL Engine Sub-Card */}
              <div className="rounded-xl border border-border bg-surface/50 p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-foreground">
                    <span className="text-primary">⚡</span> DYNAMIC TRAILING SL ENGINE:
                  </div>
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400 border border-rose-500/30">
                    ■ STOPPED OUT: ₹{(data?.stopLoss ?? 109.74).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">ACTIVE TRAILING SL:</p>
                    <p className="font-bold text-rose-400">₹{(data?.stopLoss ?? 109.74).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">PEAK WATERMARK LTP:</p>
                    <p className="font-bold text-amber-400">₹{premium.toFixed(2)}</p>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-1 text-[11px] font-mono text-muted-foreground">
                  <span className="text-muted-foreground">EXECUTION STATE: </span>
                  <span className="text-rose-400 font-semibold">
                    🚨 Trailing SL hit at ₹{(data?.stopLoss ?? 109.74).toFixed(2)}
                  </span>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/50 p-2 text-[10px] text-muted-foreground leading-relaxed">
                  <strong className="text-primary">🛡️ REVERSAL PROTECTION ACTIVE:</strong> When price hits TP1 (+1.5R),
                  sell 50% lots and move SL to entry (breakeven). If market reverses, your loss is ₹0 and you keep the 50% profit.
                </div>
              </div>

              {/* Execution Management Rules */}
              <div className="rounded-xl border border-border bg-background/40 p-3 text-[10px] text-muted-foreground space-y-1.5 leading-relaxed">
                <p className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
                  <span>📋</span> EXECUTION MANAGEMENT RULES
                </p>
                <p>
                  • <strong className="text-foreground">Max 20% Option SL Cap:</strong> Hard stop-loss on option premium
                  (capped at max 20% loss) eliminates huge option decay drawdowns.
                </p>
                <p>
                  • <strong className="text-foreground">TP1 Target (1.5R):</strong> Lock 50% lot profit &amp;
                  automatically shift SL to breakeven.
                </p>
                <p>
                  • <strong className="text-foreground">TP2 Target (2.5R):</strong> Runner position target for maximum
                  Risk:Reward.
                </p>
                <p>
                  • <strong className="text-foreground">Auto Square-off:</strong> Exit intraday positions before 03:15 PM IST.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Live Option Chain (Strikes & Premiums) */}
        <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔗</span>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
                LIVE OPTION CHAIN ({instrument} — STRIKES &amp; PREMIUMS)
              </h3>
              <span className="rounded bg-surface px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
                MODEL ESTIMATE
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadData(instrument)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-[11px] font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                REFRESH QUOTES
              </button>
              <span className="font-mono text-[11px] text-muted-foreground">
                Step: {cfg.step} pts · Lot Size: {cfg.lotSize} Qty
              </span>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-center font-mono text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground bg-background/50">
                  <th className="py-2.5 px-3 text-left">CALL LTP (₹)</th>
                  <th className="py-2.5 px-3">CALL TYPE</th>
                  <th className="py-2.5 px-3 font-bold text-foreground">STRIKE PRICE</th>
                  <th className="py-2.5 px-3">PUT TYPE</th>
                  <th className="py-2.5 px-3 text-right">PUT LTP (₹)</th>
                  <th className="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(data?.strikes ?? []).map((row) => (
                  <tr key={row.strike} className="hover:bg-accent/30 transition">
                    <td className="py-2.5 px-3 text-left font-bold text-emerald-400">
                      ₹{row.callLtp.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          row.callType === "ITM"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : row.callType === "ATM"
                            ? "bg-primary text-primary-foreground shadow-glow"
                            : "bg-surface text-muted-foreground border border-border"
                        }`}
                      >
                        {row.callType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-foreground text-sm">
                      {row.strike} {row.callType === "ATM" || row.putType === "ATM" ? "(ATM)" : ""}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          row.putType === "ITM"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : row.putType === "ATM"
                            ? "bg-primary text-primary-foreground shadow-glow"
                            : "bg-surface text-muted-foreground border border-border"
                        }`}
                      >
                        {row.putType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                      ₹{row.putLtp.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => handleSelectStrike(row.strike, "CE", row.callLtp)}
                          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
                        >
                          CALC CE
                        </button>
                        <button
                          onClick={() => handleSelectStrike(row.strike, "PE", row.putLtp)}
                          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400 hover:bg-rose-500/20 transition"
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
        <section className="rounded-2xl border border-border bg-surface/60 p-4 shadow-lg backdrop-blur text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <span className="text-primary">⚙</span>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-foreground">
                RECENT CONFLUENCE SIGNALS
              </h3>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">Showing last 6 setups</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(data?.recentSignals ?? []).map((sig) => {
              const isPe = sig.type.includes("PE");
              return (
                <div
                  key={sig.id}
                  className="rounded-xl border border-border bg-background/50 p-3 font-mono space-y-2 hover:border-primary/50 transition shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-extrabold ${
                        isPe
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      }`}
                    >
                      {sig.type} {isPe ? "▼" : "▲"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{sig.timeStr}</span>
                  </div>

                  <div>
                    <p className="font-bold text-foreground text-sm">
                      Spot @ {sig.spot.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{sig.rationale}</p>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[10px]">
                    <span className="text-emerald-400 font-semibold">TARGET: {sig.target.toFixed(2)}</span>
                    <span className="text-rose-400 font-semibold">STOP: {sig.stop.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Workstation Footer Disclaimer */}
        <footer className="border-t border-border pt-4 pb-8 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          INSTITUTIONAL TRADING ENGINE LOGIC. EDUCATIONAL &amp; RESEARCH SIGNALS. TRADE RESPONSIBLY.
        </footer>
      </div>
    </div>
  );
}
