import { useState, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LiveStockQuote } from "@/lib/indian-stocks.functions";
import { formatINR } from "@/lib/market-data";
import {
  ArrowDownRight,
  ArrowUpRight,
  Search,
  ExternalLink,
  BarChart2,
  FileText,
  Newspaper,
  Zap,
  SlidersHorizontal,
} from "lucide-react";

const SECTORS = [
  "All",
  "Financials",
  "IT Services",
  "Energy",
  "Auto",
  "Pharma",
  "Healthcare",
  "FMCG",
  "Metals",
  "Power",
  "Telecom",
];

export function IndianStocksLiveWatch({
  quotes,
  loading,
  feedSource,
  onOpenDhanModal,
}: {
  quotes: LiveStockQuote[];
  loading: boolean;
  feedSource: string;
  onOpenDhanModal: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState("All");
  const [sortField, setSortField] = useState<"changePct" | "price" | "volume" | "symbol">("changePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = useMemo(() => {
    let list = [...quotes];

    if (selectedSector !== "All") {
      list = list.filter((q) => q.sector.toLowerCase().includes(selectedSector.toLowerCase()));
    }

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q));
    }

    list.sort((a, b) => {
      let diff = 0;
      if (sortField === "changePct") diff = a.changePct - b.changePct;
      else if (sortField === "price") diff = a.price - b.price;
      else if (sortField === "volume") diff = a.volume - b.volume;
      else if (sortField === "symbol") diff = a.symbol.localeCompare(b.symbol);
      return sortAsc ? diff : -diff;
    });

    return list;
  }, [quotes, selectedSector, search, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const formatVol = (v: number) =>
    v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v);

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Indian Stocks Live Screener</h2>
            <button
              onClick={onOpenDhanModal}
              title="Click to manage DhanHQ API"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                feedSource.includes("Dhan")
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>{feedSource}</span>
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Real-time Nifty 100 prices, 52-week ranges, financial metrics &amp; direct charting
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search stock by symbol or name..."
            className="h-9 w-full rounded-lg border border-border bg-background/50 pl-9 pr-3 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Sector filter tabs */}
      <div className="mt-4 flex flex-wrap gap-1.5 overflow-x-auto pb-1">
        {SECTORS.map((sec) => (
          <button
            key={sec}
            onClick={() => {
              setSelectedSector(sec);
              setPage(1);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              selectedSector === sec
                ? "bg-primary text-primary-foreground shadow-glow"
                : "border border-border/60 bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Stock table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/70 text-muted-foreground">
              <th
                onClick={() => toggleSort("symbol")}
                className="cursor-pointer py-3 pl-2 pr-4 hover:text-foreground"
              >
                Stock &amp; Company
              </th>
              <th
                onClick={() => toggleSort("price")}
                className="cursor-pointer py-3 px-3 text-right hover:text-foreground"
              >
                Price (LTP)
              </th>
              <th
                onClick={() => toggleSort("changePct")}
                className="cursor-pointer py-3 px-3 text-right hover:text-foreground"
              >
                24h Change
              </th>
              <th className="py-3 px-3 text-center hidden md:table-cell">Day Range (L - H)</th>
              <th className="py-3 px-3 text-center hidden lg:table-cell">52W Range</th>
              <th
                onClick={() => toggleSort("volume")}
                className="cursor-pointer py-3 px-3 text-right hidden sm:table-cell hover:text-foreground"
              >
                Volume
              </th>
              <th className="py-3 pr-2 pl-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {currentItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                  {loading ? "Streaming live Indian stock prices..." : "No stocks matching your criteria."}
                </td>
              </tr>
            ) : (
              currentItems.map((q) => {
                const pos = q.changePct >= 0;
                const daySpan = q.high - q.low;
                const dayPct = daySpan > 0 ? ((q.price - q.low) / daySpan) * 100 : 50;

                return (
                  <tr
                    key={q.symbol}
                    className="group transition hover:bg-accent/40"
                  >
                    <td className="py-3 pl-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/desktop/charts"
                          search={{ symbol: q.symbol }}
                          className="font-semibold text-foreground group-hover:text-primary transition"
                        >
                          {q.symbol}
                        </Link>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {q.sector}
                        </span>
                      </div>
                      <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-muted-foreground">
                        {q.name}
                      </p>
                    </td>

                    <td className="py-3 px-3 text-right font-display text-sm font-semibold">
                      {formatINR(q.price)}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          pos
                            ? "border border-success/30 bg-success/10 text-success"
                            : "border border-destructive/30 bg-destructive/10 text-destructive"
                        }`}
                      >
                        {pos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {pos ? "+" : ""}
                        {q.changePct.toFixed(2)}%
                      </span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {pos ? "+" : ""}
                        {q.change.toFixed(2)}
                      </p>
                    </td>

                    <td className="py-3 px-3 hidden md:table-cell">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatINR(q.low)}</span>
                        <span>{formatINR(q.high)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-background overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pos ? "bg-success" : "bg-destructive"}`}
                          style={{ width: `${Math.min(100, Math.max(5, dayPct))}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center hidden lg:table-cell text-[11px]">
                      <span className="text-muted-foreground">{formatINR(q.low52)}</span>
                      <span className="mx-1 text-muted-foreground/60">—</span>
                      <span className="font-medium text-foreground">{formatINR(q.high52)}</span>
                    </td>

                    <td className="py-3 px-3 text-right hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {formatVol(q.volume)}
                    </td>

                    <td className="py-3 pr-2 pl-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to="/desktop/charts"
                          search={{ symbol: q.symbol }}
                          title="Interactive Historical Chart"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary transition"
                        >
                          <BarChart2 className="h-3 w-3" />
                          <span className="hidden xl:inline">Chart</span>
                        </Link>
                        <Link
                          to="/desktop/charts"
                          search={{ symbol: q.symbol }}
                          title="Financial Performance & Balance Sheet"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary transition"
                        >
                          <FileText className="h-3 w-3" />
                          <span className="hidden xl:inline">Financials</span>
                        </Link>
                        <Link
                          to="/desktop/charts"
                          search={{ symbol: q.symbol }}
                          title="Latest Company News"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary transition"
                        >
                          <Newspaper className="h-3 w-3" />
                          <span className="hidden xl:inline">News</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
          <p className="text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(filtered.length, page * pageSize)} of {filtered.length} Indian stocks
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-border bg-background/50 px-3 py-1 text-xs hover:bg-accent disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-border bg-background/50 px-3 py-1 text-xs hover:bg-accent disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
