export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-surface/60 via-accent/40 to-surface/60 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-40" />
      <Skeleton className="mt-4 h-24 w-full" />
    </div>
  );
}
