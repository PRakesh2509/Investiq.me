import { GLOBAL_TABS, NSE_TABS } from "./constants";

export function InstrumentTabs({
  instrument,
  setInstrument,
}: {
  instrument: string;
  setInstrument: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-xs backdrop-blur shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">
          NSE F&amp;O:
        </span>
        {NSE_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setInstrument(t)}
            className={`rounded-lg px-3 py-1 font-medium transition ${
              instrument === t
                ? "bg-gradient-primary text-primary-foreground font-bold shadow-glow"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
        <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">
          GLOBAL:
        </span>
        {GLOBAL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setInstrument(t)}
            className={`rounded-lg px-3 py-1 font-medium transition ${
              instrument === t
                ? "bg-gradient-primary text-primary-foreground font-bold shadow-glow"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
