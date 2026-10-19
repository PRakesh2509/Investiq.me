import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { X } from "lucide-react";
import TradingTerminal, { type Instrument } from "@/components/terminal/TradingTerminal";
import FnoIndiaTV from "@/components/tradingview/FnoIndiaTV";

const USA: Instrument[] = [
  { key: "nq", label: "Nasdaq 100 (NQ)", yahoo: "NQ=F", priceDecimals: 2 },
  { key: "ym", label: "Dow Jones (YM)", yahoo: "YM=F", priceDecimals: 2 },
  { key: "es", label: "S&P 500 (ES)", yahoo: "ES=F", priceDecimals: 2 },
  { key: "btc", label: "Bitcoin (BTC)", yahoo: "BTC-USD", priceDecimals: 2 },
  { key: "gold", label: "Gold (XAU/USD)", yahoo: "GC=F", priceDecimals: 2 },
];

const CRYPTO: Instrument[] = [
  { key: "btc", label: "Bitcoin (BTC)", yahoo: "BTC-USD", priceDecimals: 2 },
  { key: "eth", label: "Ethereum (ETH)", yahoo: "ETH-USD", priceDecimals: 2 },
  { key: "xau", label: "XAU/USD (Gold)", yahoo: "XAUUSD=X", priceDecimals: 2 },
  { key: "bnb", label: "BNB", yahoo: "BNB-USD", priceDecimals: 2 },
  { key: "sol", label: "Solana (SOL)", yahoo: "SOL-USD", priceDecimals: 2 },
  { key: "xrp", label: "XRP", yahoo: "XRP-USD", priceDecimals: 4 },
  { key: "ada", label: "Cardano (ADA)", yahoo: "ADA-USD", priceDecimals: 4 },
  { key: "doge", label: "Dogecoin (DOGE)", yahoo: "DOGE-USD", priceDecimals: 5 },
  { key: "avax", label: "Avalanche (AVAX)", yahoo: "AVAX-USD", priceDecimals: 3 },
  { key: "link", label: "Chainlink (LINK)", yahoo: "LINK-USD", priceDecimals: 3 },
  { key: "dot", label: "Polkadot (DOT)", yahoo: "DOT-USD", priceDecimals: 3 },
  { key: "ton", label: "Toncoin (TON)", yahoo: "TON-USD", priceDecimals: 3 },
  { key: "matic", label: "Polygon (MATIC)", yahoo: "MATIC-USD", priceDecimals: 4 },
];

type Market = "usa" | "crypto" | "fno-india";
const TABS: { key: Market; label: string; instruments: Instrument[]; currency: string }[] = [
  { key: "fno-india", label: "F&O India", instruments: [], currency: "₹" },
  { key: "usa", label: "USA F&O", instruments: USA, currency: "$" },
  { key: "crypto", label: "Crypto & Forex", instruments: CRYPTO, currency: "$" },
];

export const Route = createFileRoute("/desktop/terminal")({
  head: () => ({
    meta: [
      { title: "InvestIQ · Trading Terminal — Live Charts" },
      {
        name: "description",
        content:
          "Trading terminal with candlestick charts for US futures, crypto and forex, plus Telegram trade alerts.",
      },
      { property: "og:title", content: "InvestIQ · Trading Terminal" },
      {
        property: "og:description",
        content: "Candlestick charts for US futures and crypto/forex with Telegram trade alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  const [tab, setTab] = useState<Market>("fno-india");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Trading Terminal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Candlestick charts for Indian F&amp;O, US futures and crypto/forex with Telegram trade alerts.
          </p>
        </div>
        <Link
          to="/desktop"
          aria-label="Close terminal"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface/60 text-muted-foreground transition hover:border-primary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              t.key === tab
                ? "bg-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fno-india" ? (
        <FnoIndiaTV />
      ) : (
        <TradingTerminal
          key={active.key}
          instruments={active.instruments}
          currencySymbol={active.currency}
        />
      )}
    </div>
  );
}
