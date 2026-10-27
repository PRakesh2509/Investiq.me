import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { IPO } from "@/lib/ipos";

export function StrengthsRisks({ ipo }: { ipo: IPO }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Bullish Arguments &amp; Competitive Moats
          </h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {ipo.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Bearish Concerns &amp; Key Risks
          </h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {ipo.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-destructive">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
