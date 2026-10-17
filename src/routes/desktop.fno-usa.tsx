import { createFileRoute } from "@tanstack/react-router";
import FnoView from "@/components/FnoView";

export const Route = createFileRoute("/desktop/fno-usa")({
  component: () => <FnoView market="usa" title="F&O · USA (S&P 500 · Nasdaq · Dow)" currency="USD" />,
});
