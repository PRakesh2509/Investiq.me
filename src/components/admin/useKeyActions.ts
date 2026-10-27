import { useState } from "react";
import { toast } from "sonner";
import { useAdmin, type KeyScope } from "@/context/AdminContext";

export const SCOPE_LABEL: Record<KeyScope, string> = {
  nse: "NSE F&O",
  global: "Global",
};

/**
 * Rotate / revoke flows. A freshly generated key is surfaced exactly once (`fresh`) so the
 * admin can copy it; afterwards only masked metadata is shown.
 */
export function useKeyActions() {
  const { keyStatus, rotateKey, revokeKey } = useAdmin();
  const [fresh, setFresh] = useState<Record<KeyScope, string | null>>({ nse: null, global: null });
  const [busy, setBusy] = useState<KeyScope | null>(null);

  const rotate = async (scope: KeyScope) => {
    if (busy) return;
    if (
      keyStatus[scope].configured &&
      !window.confirm(
        `Rotate the ${SCOPE_LABEL[scope]} API key? The current key stops working immediately.`,
      )
    ) {
      return;
    }
    setBusy(scope);
    try {
      const res = await rotateKey(scope);
      if (res.ok) {
        setFresh((prev) => ({ ...prev, [scope]: res.key }));
        toast.success(`New ${SCOPE_LABEL[scope]} API key generated — copy it now`);
      }
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (scope: KeyScope) => {
    if (busy) return;
    if (
      !window.confirm(
        `Revoke the ${SCOPE_LABEL[scope]} API key? Integrations using it will stop working.`,
      )
    ) {
      return;
    }
    setBusy(scope);
    try {
      if (await revokeKey(scope)) {
        setFresh((prev) => ({ ...prev, [scope]: null }));
        toast.success(`${SCOPE_LABEL[scope]} API key revoked`);
      }
    } finally {
      setBusy(null);
    }
  };

  const dismiss = (scope: KeyScope) => setFresh((prev) => ({ ...prev, [scope]: null }));

  return { fresh, busy, rotate, revoke, dismiss };
}
