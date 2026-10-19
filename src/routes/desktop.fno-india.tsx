import { createFileRoute } from "@tanstack/react-router";
import OrderBlockEngine from "@/components/terminal/OrderBlockEngine";

export const Route = createFileRoute("/desktop/fno-india")({
  head: () => ({
    meta: [
      { title: "InvestIQ · Order Block Engine — Indian Index F&O" },
      {
        name: "description",
        content:
          "Multi-pivot confluence & institutional option orderflow engine for NIFTY, BANK NIFTY, FIN NIFTY and SENSEX with live charts, option chain and dynamic trailing stop loss.",
      },
      { property: "og:title", content: "InvestIQ · Order Block Engine — Indian F&O" },
      {
        property: "og:description",
        content: "Institutional option orderflow engine with live technical charts and Telegram execution alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FnoIndiaPage,
});

function FnoIndiaPage() {
  return <OrderBlockEngine />;
}
