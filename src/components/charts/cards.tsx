export function LevelCard({
  label,
  value,
  sub,
  subColor,
  hint,
}: {
  label: string;
  value: string;
  sub: string;
  subColor: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-primary">{value}</p>
      <p className={`mt-1 text-xs ${subColor}`}>{sub}</p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ZoneCard({
  tone,
  label,
  range,
  desc,
  cta,
}: {
  tone: "success" | "primary" | "destructive";
  label: string;
  range: string;
  desc: string;
  cta: string;
}) {
  const border =
    tone === "success"
      ? "border-success/40 bg-success/5"
      : tone === "destructive"
        ? "border-destructive/40 bg-destructive/5"
        : "border-primary/40 bg-primary/5";
  const btn =
    tone === "success"
      ? "bg-success text-background hover:opacity-90"
      : tone === "destructive"
        ? "bg-destructive text-background hover:opacity-90"
        : "bg-primary text-primary-foreground hover:opacity-90";
  const val =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-primary";
  return (
    <div className={`rounded-2xl border p-5 ${border}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-xl font-semibold ${val}`}>{range}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <button className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold ${btn}`}>{cta}</button>
    </div>
  );
}

export function SentimentRow({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono font-semibold text-foreground">{pct}%</span>
    </li>
  );
}
