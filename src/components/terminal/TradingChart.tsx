import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "@/lib/terminal.functions";
import { ema, bollinger, vwap } from "@/lib/indicators";

export interface Toggles {
  ema9: boolean;
  ema21: boolean;
  ema50: boolean;
  bb: boolean;
  vwap: boolean;
  volume: boolean;
}

export default function TradingChart({
  bars,
  toggles,
}: {
  bars: Bar[];
  toggles: Toggles;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volChartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<any> | null>>({});

  // Init
  useEffect(() => {
    if (!containerRef.current || !volRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "Inter, ui-sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    const vol = createChart(volRef.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#94a3b8", fontFamily: "Inter, ui-sans-serif" },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.05)" },
        horzLines: { color: "rgba(148,163,184,0.05)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;
    volChartRef.current = vol;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    seriesRefs.current.candle = candle;

    seriesRefs.current.ema9 = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    seriesRefs.current.ema21 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    seriesRefs.current.ema50 = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    seriesRefs.current.bbUp = chart.addSeries(LineSeries, { color: "rgba(148,163,184,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    seriesRefs.current.bbLo = chart.addSeries(LineSeries, { color: "rgba(148,163,184,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    seriesRefs.current.vwap = chart.addSeries(LineSeries, { color: "#e7a92a", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

    seriesRefs.current.volume = vol.addSeries(HistogramSeries, { priceFormat: { type: "volume" } });

    // Sync time scales
    const sync = (from: IChartApi, to: IChartApi) => {
      from.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) to.timeScale().setVisibleLogicalRange(range);
      });
    };
    sync(chart, vol);
    sync(vol, chart);

    return () => {
      chart.remove();
      vol.remove();
      chartRef.current = null;
      volChartRef.current = null;
      seriesRefs.current = {};
    };
  }, []);

  // Update data
  useEffect(() => {
    if (!bars.length) return;
    const candle = seriesRefs.current.candle;
    if (!candle) return;

    const cData = bars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open, high: b.high, low: b.low, close: b.close,
    }));
    candle.setData(cData);

    const closes = bars.map((b) => b.close);
    const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50);
    const bb = bollinger(closes, 20, 2);
    const vw = vwap(bars);

    const line = (arr: (number | null)[]) =>
      bars.map((b, i) => ({ time: b.time as UTCTimestamp, value: arr[i] ?? NaN }))
        .filter((p) => Number.isFinite(p.value));

    seriesRefs.current.ema9?.setData(toggles.ema9 ? line(e9) : []);
    seriesRefs.current.ema21?.setData(toggles.ema21 ? line(e21) : []);
    seriesRefs.current.ema50?.setData(toggles.ema50 ? line(e50) : []);
    seriesRefs.current.bbUp?.setData(toggles.bb ? line(bb.upper) : []);
    seriesRefs.current.bbLo?.setData(toggles.bb ? line(bb.lower) : []);
    seriesRefs.current.vwap?.setData(toggles.vwap ? line(vw) : []);

    seriesRefs.current.volume?.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)",
      })),
    );
  }, [bars, toggles]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="h-[420px] w-full rounded-xl border border-border bg-surface/40" />
      <div
        ref={volRef}
        className="h-[110px] w-full rounded-xl border border-border bg-surface/40"
        style={{ display: toggles.volume ? "block" : "none" }}
      />
    </div>
  );
}
