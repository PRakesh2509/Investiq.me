import { createFileRoute } from "@tanstack/react-router";
import TradingTerminalWorkstation from "@/components/terminal/TradingTerminalWorkstation";

export const Route = createFileRoute("/desktop/terminal")({
  head: () => ({
    meta: [
      { title: "InvestIQ · F&O LIVE — Institutional F&O & Global Workstation" },
      {
        name: "description",
        content:
          "Institutional F&O workstation with live TradingView charts for Indian F&O and Global indices, AI confluence signals, live option chain and risk management.",
      },
      { property: "og:title", content: "InvestIQ · F&O LIVE" },
      {
        property: "og:description",
        content: "Institutional trading terminal with live TradingView charts, AI confluence signals, option chain and calculator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  return <TradingTerminalWorkstation />;
}

