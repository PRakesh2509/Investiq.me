import { createFileRoute } from "@tanstack/react-router";
import OrderBlockEngine from "@/components/terminal/OrderBlockEngine";

export const Route = createFileRoute("/desktop/terminal")({
  head: () => ({
    meta: [
      { title: "InvestIQ · Order Block Engine — Multi-Pivot Confluence & Option Flow" },
      {
        name: "description",
        content:
          "Multi-pivot confluence & institutional option orderflow engine with live TradingView and NSE quotes, dynamic trailing stop loss, and position sizing.",
      },
      { property: "og:title", content: "InvestIQ · Order Block Engine" },
      {
        property: "og:description",
        content:
          "Institutional option orderflow engine with live candlestick chart, option chain, dynamic trailing stop loss, and position sizing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  return <OrderBlockEngine />;
}
