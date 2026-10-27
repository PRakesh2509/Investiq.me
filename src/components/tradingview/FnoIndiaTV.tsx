import { useState } from "react";
import TVWidget from "./TVWidget";
import LiveIndexChart from "./LiveIndexChart";

const INSTRUMENTS = [
  { key: "NIFTY", label: "NIFTY 50", tv: "NSE:NIFTY", dhan: "NIFTY", exchange: "NSE" },
  {
    key: "BANKNIFTY",
    label: "BANK NIFTY",
    tv: "NSE:BANKNIFTY",
    dhan: "BANKNIFTY",
    exchange: "NSE",
  },
  { key: "SENSEX", label: "SENSEX", tv: "BSE:SENSEX", dhan: "SENSEX", exchange: "BSE" },
] as const;

const INTERVALS = [
  { label: "5m", value: "5", yahoo: { interval: "5m", range: "1d" } },
  { label: "15m", value: "15", yahoo: { interval: "15m", range: "5d" } },
  { label: "1h", value: "60", yahoo: { interval: "60m", range: "1mo" } },
  { label: "1D", value: "D", yahoo: { interval: "1d", range: "6mo" } },
] as const;

/** TradingView-powered Indian index F&O panel: chart + technical rating + watchlist. */
export default function FnoIndiaTV() {
  const [sym, setSym] = useState<(typeof INSTRUMENTS)[number]>(INSTRUMENTS[0]);
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>(INTERVALS[1]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface/50 p-1">
          {INSTRUMENTS.map((i) => (
            <button
              key={i.key}
              onClick={() => setSym(i)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                i.key === sym.key
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-border bg-surface/50 p-1">
          {INTERVALS.map((t) => (
            <button
              key={t.value}
              onClick={() => setInterval(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                t.value === interval.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <LiveIndexChart
        key={`chart-${sym.key}-${interval.value}`}
        symbol={sym.dhan}
        dhanSymbol={sym.dhan}
        exchange={sym.exchange}
        label={sym.label}
        interval={interval.yahoo.interval}
        range={interval.yahoo.range}
        height={520}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 space-y-2">
          <h2 className="text-sm font-semibold">Technical rating · {sym.label}</h2>
          <TVWidget
            key={`ta-${sym.key}-${interval.value}`}
            script="embed-widget-technical-analysis.js"
            height={430}
            config={{
              interval: interval.value === "D" ? "1D" : `${interval.value}m`,
              width: "100%",
              isTransparent: true,
              height: 420,
              symbol: sym.tv,
              showIntervalTabs: true,
              displayMode: "single",
              locale: "in",
              colorTheme: "dark",
            }}
          />
        </div>
        <div className="col-span-2 space-y-2">
          <h2 className="text-sm font-semibold">Index F&amp;O watchlist</h2>
          <TVWidget
            key="mini-watchlist"
            script="embed-widget-market-quotes.js"
            height={430}
            config={{
              width: "100%",
              height: 420,
              symbolsGroups: [
                {
                  name: "Indices",
                  originalName: "Indices",
                  symbols: [
                    { name: "NSE:NIFTY", displayName: "NIFTY 50" },
                    { name: "NSE:BANKNIFTY", displayName: "BANK NIFTY" },
                    { name: "NSE:CNXFINANCE", displayName: "FIN NIFTY" },
                    { name: "NSE:NIFTY_MID_SELECT", displayName: "MIDCPNIFTY" },
                    { name: "BSE:SENSEX", displayName: "SENSEX" },
                    { name: "NSE:INDIAVIX", displayName: "INDIA VIX" },
                  ],
                },
              ],
              showSymbolLogo: true,
              isTransparent: true,
              colorTheme: "dark",
              locale: "in",
            }}
          />
        </div>
      </div>
    </div>
  );
}
