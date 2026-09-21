import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer rounded-sm', className)} />;
}

/** Three-line block shaped like a card body. */
export function CardSkeleton({ label }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="rounded-card border border-border bg-surface-raised p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20 rounded-chip" />
      </div>
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="mb-2 h-3 w-11/12" />
      <Skeleton className="h-3 w-2/3" />
      {label && <p className="mt-3 text-xs text-fg-muted">{label}</p>}
    </div>
  );
}

/** Row-shaped skeletons for lists. */
export function RowSkeletons({ rows = 4, height = 'h-14' }: { rows?: number; height?: string }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn('flex items-center gap-3 px-4 hairline-b', height)}>
          <Skeleton className="size-4" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}
