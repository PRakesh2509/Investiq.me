import { createFileRoute } from "@tanstack/react-router";
import OptionChain from "@/components/OptionChain";

export const Route = createFileRoute("/desktop/option-chain")({
  head: () => ({
    meta: [
      { title: "InvestIQ · Live Option Chain — NIFTY, BANKNIFTY & Stock Options" },
      {
        name: "description",
        content:
          "Live option chain with OI, change in OI, volume, LTP, bid/ask, IV and full greeks plus PCR, max pain and ATM/ITM/OTM highlighting for Indian index and stock options.",
      },
      { property: "og:title", content: "InvestIQ · Live Option Chain" },
      {
        property: "og:description",
        content:
          "Real-time option chain with greeks, PCR and max pain for NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY and SENSEX.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OptionChainPage,
});

function OptionChainPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Live Option Chain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Index &amp; stock options with OI, greeks, PCR and max pain — streamed through a secure
          server route.
        </p>
      </div>
      <OptionChain />
    </div>
  );
}
