import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while a list streams in. */
export function TableSkeleton({ rows = 8, columns = 5, toolbar = true }: { rows?: number; columns?: number; toolbar?: boolean }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      {toolbar && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-9 w-full sm:w-72" />
          <Skeleton className="h-9 w-full sm:w-40" />
          <Skeleton className="h-9 w-full sm:w-40" />
        </div>
      )}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="bg-muted/40 flex gap-6 border-b px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 border-b px-4 py-4 last:border-0">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={c === 0 ? "h-4 flex-[1.5]" : "h-4 flex-1"} />
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="gap-3 p-5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-9 rounded-xl" />
          </div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-4 p-6 lg:col-span-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </Card>
        <Card className="gap-4 p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
