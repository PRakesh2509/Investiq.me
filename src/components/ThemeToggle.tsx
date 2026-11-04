import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

/**
 * Both icons are always rendered; CSS picks the one for the active theme.
 * That keeps the markup identical on the server and the client, so hydrating
 * never flips the icon.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark and light theme"
      title="Dark / light"
      className={`iq-theme-toggle ${className}`.trim()}
    >
      <Sun className="iq-theme-toggle__icon iq-theme-toggle__icon--sun" aria-hidden="true" />
      <Moon className="iq-theme-toggle__icon iq-theme-toggle__icon--moon" aria-hidden="true" />
    </button>
  );
}
