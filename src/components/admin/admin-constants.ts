import type { KeyScope } from "@/context/AdminContext";

// Permanent Telegram chat IDs — do not remove. Always included in outbound alerts.
export const PERMANENT_CHAT_IDS = [
  "7350570004",
  "6799336293",
] as const;

export const DEFAULT_LOVABLE_ENDPOINT =
  "https://637793ac-c049-46b9-aed4-edaff2e3ea91.lovableproject.com/api/public/investiq/trades";

export const API_KEY_PREFIX: Record<KeyScope, string> = {
  nse: "iq_nse_fno_",
  global: "iq_global_",
};

/** Cryptographically secure API key: `<prefix>` + 32 random bytes as hex. */
export function generateApiKey(scope: KeyScope): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure random generator (crypto.getRandomValues) is unavailable");
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${API_KEY_PREFIX[scope]}${hex}`;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return "••••••••••••";
  return `${key.slice(0, 8)}${"•".repeat(Math.max(12, key.length - 12))}${key.slice(-4)}`;
}
