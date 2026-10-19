import { createFileRoute } from "@tanstack/react-router";
import FnoIndiaTV from "@/components/tradingview/FnoIndiaTV";
import FnoView from "@/components/FnoView";

export const Route = createFileRoute("/desktop/fno-india")({
  head: () => ({
    meta: [
      { title: "InvestIQ · Indian F&O Signals on TradingView" },
      {
        name: "description",
        content:
          "Live TradingView charts and technical signals for NIFTY, BANK NIFTY, FIN NIFTY and SENSEX index F&O, with pivot/CPR confluence setups.",
      },
      { property: "og:title", content: "InvestIQ · Indian F&O Signals" },
      {
        property: "og:description",
        content: "TradingView charts plus technical buy/sell signals for Indian index F&O.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FnoIndiaPage,
});

function FnoIndiaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">F&amp;O · India</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TradingView live charts and technical signal gauges for Indian index F&amp;O ·
          Educational, not advice
        </p>
      </div>

      <FnoIndiaTV />

      <FnoView market="india" title="Confluence signals · India" currency="INR" />
    </div>
  );
}
