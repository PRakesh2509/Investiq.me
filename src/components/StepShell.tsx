import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StepShellProps {
  step: number;
  totalSteps: number;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  backTo?: string;
  footer?: ReactNode;
}

export function StepShell({
  step,
  totalSteps,
  eyebrow,
  title,
  description,
  children,
  backTo,
  footer,
}: StepShellProps) {
  const pct = Math.round((step / totalSteps) * 100);
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Invest<span className="text-gradient">IQ</span>
          </span>
        </Link>
        {backTo ? (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">
            Step {step} of {totalSteps}
          </span>
        )}
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 pb-16 md:grid-cols-[1fr_1.2fr] md:pt-6">
        <aside className="hidden md:block">
          <div className="sticky top-6 rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Onboarding
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight">
              A guided path to your Demat account
            </h2>
            <div className="mt-6 space-y-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {pct}% complete · Step {step} of {totalSteps}
              </p>
            </div>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Bank-grade encryption on every field",
                "Fully SEBI-compliant KYC flow",
                "Get trading-ready in under 5 minutes",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-muted-foreground">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section>
          <div
            className={cn(
              "rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant md:p-10",
            )}
          >
            {eyebrow && (
              <p className="text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
            )}
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight md:text-4xl">
              {title}
            </h1>
            {description && (
              <p className="mt-3 max-w-lg text-sm text-muted-foreground md:text-base">
                {description}
              </p>
            )}
            <div className="mt-8">{children}</div>
          </div>
          {footer && <div className="mt-6">{footer}</div>}
        </section>
      </main>
    </div>
  );
}
