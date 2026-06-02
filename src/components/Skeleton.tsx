export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 ${className ?? ""}`} />;
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 2 === 0 ? "w-full" : "w-3/4"}`} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3, lines }: { count?: number; lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white px-5 py-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-8 w-20 rounded-xl" />
    </div>
  );
}
