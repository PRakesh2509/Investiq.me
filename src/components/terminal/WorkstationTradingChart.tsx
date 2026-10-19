import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { WorkstationBar } from "@/lib/terminal-workstation.functions";
import { ema, vwap, supertrend } from "@/lib/indicators";

export interface IndicatorToggles {
  ema9: boolean;
  ema21: boolean;
  vwap: boolean;
  supertrend: boolean;
  volume: boolean;
}

interface WorkstationTradingChartProps {
  bars: WorkstationBar[];
  toggles: IndicatorToggles;
  chartType: "CANDLES" | "LINE";
  entry?: number;
  tp1?: number;
  tp2?: number;
  stopLoss?: number;
  setupActive?: boolean;
}

export default function WorkstationTradingChart({
  bars,
  toggles,
  chartType,
  entry,
  tp1,
  tp2,
  stopLoss,
  setupActive = true,
}: WorkstationTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const seriesRefs = useRef<{
    candle?: ISeriesApi<any> | null;
    line?: ISeriesApi<any> | null;
    ema9?: ISeriesApi<any> | null;
    ema21?: ISeriesApi<any> | null;
    vwap?: ISeriesApi<any> | null;
    supertrend?: ISeriesApi<any> | null;
    volume?: ISeriesApi<any> | null;
  }>({});

  const priceLinesRef = useRef<{
    entry?: any;
    tp1?: any;
    tp2?: any;
    sl?: any;
  }>({});

  // 1. Initialize Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "Space Grotesk, Inter, ui-sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.07)" },
        horzLines: { color: "rgba(148, 163, 184, 0.07)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        scaleMargins: {
          top: 0.1,
          bottom: 0.2, // Leave bottom 20% for volume
        },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // Magnet crosshair
        vertLine: {
          color: "rgba(148, 163, 184, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(148, 163, 184, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
    });

    chartRef.current = chart;

    // Candlestick Series (Default)
    seriesRefs.current.candle = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    // Line Series (Alternate)
    seriesRefs.current.line = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      visible: false,
    });

    // Volume Series (Overlayed at bottom 20%)
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume_overlay",
    });
    vol.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    seriesRefs.current.volume = vol;

    // Technical Indicators
    seriesRefs.current.ema9 = chart.addSeries(LineSeries, {
      color: "#22d3ee", // Cyan
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EMA 9",
    });

    seriesRefs.current.ema21 = chart.addSeries(LineSeries, {
      color: "#f59e0b", // Amber
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EMA 21",
    });

    seriesRefs.current.vwap = chart.addSeries(LineSeries, {
      color: "#eab308", // Gold
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "VWAP",
    });

    seriesRefs.current.supertrend = chart.addSeries(LineSeries, {
      color: "#10b981", // Emerald
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "SUPERTREND",
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = {};
      priceLinesRef.current = {};
    };
  }, []);

  // 2. Update Bars and Indicators whenever data or toggles change
  useEffect(() => {
    if (!bars.length || !chartRef.current) return;

    // Clean, sort, and deduplicate timestamps for Lightweight Charts
    const sorted = [...bars].sort((a, b) => a.time - b.time);
    const cleanBars: WorkstationBar[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i].time > cleanBars[cleanBars.length - 1].time) {
        cleanBars.push(sorted[i]);
      }
    }
    if (!cleanBars.length) return;

    const candleData = cleanBars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const lineData = cleanBars.map((b) => ({
      time: b.time as UTCTimestamp,
      value: b.close,
    }));

    // Switch between Candle and Line series
    const isCandle = chartType === "CANDLES";
    if (seriesRefs.current.candle) {
      seriesRefs.current.candle.applyOptions({ visible: isCandle });
      if (isCandle) seriesRefs.current.candle.setData(candleData);
    }
    if (seriesRefs.current.line) {
      seriesRefs.current.line.applyOptions({ visible: !isCandle });
      if (!isCandle) seriesRefs.current.line.setData(lineData);
    }

    // Volume
    if (seriesRefs.current.volume) {
      if (toggles.volume) {
        seriesRefs.current.volume.setData(
          cleanBars.map((b) => ({
            time: b.time as UTCTimestamp,
            value: b.volume,
            color: b.close >= b.open ? "rgba(34, 197, 94, 0.45)" : "rgba(239, 68, 68, 0.45)",
          })),
        );
      } else {
        seriesRefs.current.volume.setData([]);
      }
    }

    // Indicator calculations
    const closes = cleanBars.map((b) => b.close);
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const vw = vwap(cleanBars as any);
    const st = supertrend(cleanBars as any, 10, 3);

    const makeLinePoints = (vals: (number | null)[]) => {
      const pts: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < cleanBars.length; i++) {
        const v = vals[i];
        if (typeof v === "number" && Number.isFinite(v)) {
          pts.push({ time: cleanBars[i].time as UTCTimestamp, value: +v.toFixed(2) });
        }
      }
      return pts;
    };

    // EMA 9
    if (seriesRefs.current.ema9) {
      if (toggles.ema9) {
        seriesRefs.current.ema9.applyOptions({ visible: true });
        seriesRefs.current.ema9.setData(makeLinePoints(e9));
      } else {
        seriesRefs.current.ema9.applyOptions({ visible: false });
        seriesRefs.current.ema9.setData([]);
      }
    }

    // EMA 21
    if (seriesRefs.current.ema21) {
      if (toggles.ema21) {
        seriesRefs.current.ema21.applyOptions({ visible: true });
        seriesRefs.current.ema21.setData(makeLinePoints(e21));
      } else {
        seriesRefs.current.ema21.applyOptions({ visible: false });
        seriesRefs.current.ema21.setData([]);
      }
    }

    // VWAP
    if (seriesRefs.current.vwap) {
      if (toggles.vwap) {
        seriesRefs.current.vwap.applyOptions({ visible: true });
        seriesRefs.current.vwap.setData(makeLinePoints(vw));
      } else {
        seriesRefs.current.vwap.applyOptions({ visible: false });
        seriesRefs.current.vwap.setData([]);
      }
    }

    // Supertrend
    if (seriesRefs.current.supertrend) {
      if (toggles.supertrend) {
        const lastDir = st.direction[st.direction.length - 1];
        seriesRefs.current.supertrend.applyOptions({
          visible: true,
          color: lastDir === 1 ? "#10b981" : "#f43f5e",
        });
        seriesRefs.current.supertrend.setData(makeLinePoints(st.value));
      } else {
        seriesRefs.current.supertrend.applyOptions({ visible: false });
        seriesRefs.current.supertrend.setData([]);
      }
    }

    // 3. Price Lines (Entry, TP1, TP2, Stop Loss)
    const activeTargetSeries = isCandle ? seriesRefs.current.candle : seriesRefs.current.line;
    if (activeTargetSeries) {
      // Clear old price lines
      if (priceLinesRef.current.entry) {
        activeTargetSeries.removePriceLine(priceLinesRef.current.entry);
        priceLinesRef.current.entry = undefined;
      }
      if (priceLinesRef.current.tp1) {
        activeTargetSeries.removePriceLine(priceLinesRef.current.tp1);
        priceLinesRef.current.tp1 = undefined;
      }
      if (priceLinesRef.current.tp2) {
        activeTargetSeries.removePriceLine(priceLinesRef.current.tp2);
        priceLinesRef.current.tp2 = undefined;
      }
      if (priceLinesRef.current.sl) {
        activeTargetSeries.removePriceLine(priceLinesRef.current.sl);
        priceLinesRef.current.sl = undefined;
      }

      if (setupActive) {
        if (typeof entry === "number" && entry > 0) {
          priceLinesRef.current.entry = activeTargetSeries.createPriceLine({
            price: entry,
            color: "#38bdf8",
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: "ENTRY",
          });
        }
        if (typeof tp1 === "number" && tp1 > 0) {
          priceLinesRef.current.tp1 = activeTargetSeries.createPriceLine({
            price: tp1,
            color: "#22c55e",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "TP1 (1.5R)",
          });
        }
        if (typeof tp2 === "number" && tp2 > 0) {
          priceLinesRef.current.tp2 = activeTargetSeries.createPriceLine({
            price: tp2,
            color: "#10b981",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "TP2 (2.5R)",
          });
        }
        if (typeof stopLoss === "number" && stopLoss > 0) {
          priceLinesRef.current.sl = activeTargetSeries.createPriceLine({
            price: stopLoss,
            color: "#ef4444",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "STOP LOSS",
          });
        }
      }
    }
  }, [bars, toggles, chartType, entry, tp1, tp2, stopLoss, setupActive]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
