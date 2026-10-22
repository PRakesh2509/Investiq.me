import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
  Lock,
  CheckCircle2,
  X,
  Info,
} from "lucide-react";
import type { SensibullAuthReport } from "@/lib/options-data-provider.server";

interface SensibullStatusModalProps {
  status: SensibullAuthReport | null;
}

export default function SensibullStatusModal({ status }: SensibullStatusModalProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const isAuthorized = status?.isAuthorized ?? false;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono font-medium transition ${
          isAuthorized
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
        }`}
      >
        {isAuthorized ? (
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
        ) : (
          <Lock className="h-3 w-3 text-amber-400" />
        )}
        <span>SENSIBULL STATUS: {isAuthorized ? "AUTHORIZED" : "TERMS GUARD ACTIVE"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 font-mono text-xs">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    isAuthorized
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {isAuthorized ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-sm">
                    Sensibull Data Integration Compliance
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    Strict adherence to API licensing, automated access policies &amp; Terms of Service
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground rounded p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status Body */}
            <div className="space-y-3">
              <div
                className={`rounded-xl border p-3 ${
                  isAuthorized
                    ? "border-emerald-500/30 bg-emerald-950/20"
                    : "border-amber-500/30 bg-amber-950/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-foreground">Integration State:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      isAuthorized
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {status?.status ?? "CHECKING"}
                  </span>
                </div>
                <p className="text-[11px] text-foreground/90 font-sans leading-relaxed">
                  {status?.reason ??
                    "Sensibull does not currently offer a public developer API. InvestIQ strictly refuses cookie session reuse or unauthorized web scraping."}
                </p>
              </div>

              {/* Safety & Compliance Principles */}
              <div className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
                <span className="font-bold text-foreground block text-[11px] uppercase tracking-wider">
                  Compliance Guarantees
                </span>
                <ul className="space-y-1.5 text-[10px] text-muted-foreground">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Zero Unauthorized Scraping:</strong> No browser cookies, session tokens, or private reverse-engineered endpoints are ever touched.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>DhanHQ Colocated API Feed Active:</strong> Real-time underlying spot, open interest, and quotes are authorized via DhanHQ API v2.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Internal Black-Scholes Greeks Engine:</strong> European option Greeks (Delta, Gamma, Theta, Vega, IV) are computed transparently in our verified mathematical engine.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Legal Notice */}
              <p className="text-[9px] text-muted-foreground/80 leading-tight">
                Sensibull is a registered trademark of RiskReward Technologies. When official commercial API licensing becomes available, configure SENSIBULL_PARTNER_API_KEY in server environment. Reference: {status?.documentationUrl ?? "https://sensibull.com"}
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-border pt-3">
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground hover:bg-primary/90 transition text-[11px]"
              >
                Acknowledge &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
