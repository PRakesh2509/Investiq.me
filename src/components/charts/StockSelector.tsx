import { useState } from "react";
import { Search } from "lucide-react";
import { formatINR } from "@/lib/market-data";
import { NIFTY_UNIVERSE } from "@/lib/nifty-universe";
import { SECTOR_CATEGORIES } from "./constants";

export function StockSelector({
  activeCategory,
  setActiveCategory,
  symbol,
  setSymbol,
  quickQuotes,
  quotesError,
}: {
  activeCategory: string;
  setActiveCategory: (c: string) => void;
  symbol: string;
  setSymbol: (s: string) => void;
  quickQuotes: Record<string, { price: number; changePct: number }>;
  quotesError?: boolean;
}) {
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Sector category buttons */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          {Object.keys(SECTOR_CATEGORIES).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "border border-border/70 bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Quick search input */}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={stockSearchQuery}
            onChange={(e) => {
              setStockSearchQuery(e.target.value);
              setShowStockDropdown(true);
            }}
            onFocus={() => setShowStockDropdown(true)}
            onBlur={() => setTimeout(() => setShowStockDropdown(false), 200)}
            placeholder="Search Indian stocks (e.g. RELIANCE, TCS)..."
            className="h-8 w-full rounded-lg border border-border bg-background/50 pl-8 pr-3 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
          />
          {showStockDropdown && stockSearchQuery.trim() && (
            <div className="absolute left-0 right-0 top-10 z-40 max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-2xl">
              {NIFTY_UNIVERSE.filter(
                (s) =>
                  s.symbol.includes(stockSearchQuery.trim().toUpperCase()) ||
                  s.name.toUpperCase().includes(stockSearchQuery.trim().toUpperCase()),
              )
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSymbol(s.symbol);
                      setStockSearchQuery("");
                      setShowStockDropdown(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent"
                  >
                    <div>
                      <span className="font-semibold text-foreground">{s.symbol}</span>
                      <span className="ml-2 text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {s.sector}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Stock chips for active sector with live price and % change */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
        {(SECTOR_CATEGORIES[activeCategory] || []).map((s) => {
          const q = quickQuotes[s];
          const isSelected = symbol === s;
          const pos = (q?.changePct ?? 0) >= 0;
          return (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? "border-transparent bg-gradient-primary text-primary-foreground shadow-glow"
                  : "border-border bg-background/50 text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground"
              }`}
            >
              <span>{s}</span>
              {q && (
                <span
                  className={`text-[10px] tabular-nums font-semibold ${
                    isSelected
                      ? "text-primary-foreground/90"
                      : pos
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {formatINR(q.price)} ({pos ? "+" : ""}
                  {q.changePct.toFixed(1)}%)
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
