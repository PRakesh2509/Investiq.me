import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

const KEY = "investiq_disclaimer_v1";

export function useDisclaimerAcknowledged() {
  const [ack, setAck] = useState(false);
  useEffect(() => {
    try {
      setAck(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  return {
    acknowledged: ack,
    accept: () => {
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
      setAck(true);
    },
  };
}

export function DisclaimerModal({
  open,
  onAccept,
  onCancel,
}: {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-elegant">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Important disclaimer</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              InvestIQ is{" "}
              <span className="font-medium text-foreground">
                not a SEBI (Securities and Exchange Board of India) registered
              </span>{" "}
              portal. This is an educational platform only. Please consult a SEBI-registered
              financial advisor before making any investment decisions. All stock market investments
              carry risk of loss.
            </p>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>I understand this is an educational platform and accept the risks.</span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-background/50 px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={!checked}
            onClick={onAccept}
            className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition disabled:opacity-40"
          >
            I agree, continue
          </button>
        </div>
      </div>
    </div>
  );
}
