import { LogoMark } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";

/** Static frame shown instantly while the session is verified. */
export function ShellSkeleton() {
  return (
    <div className="bg-app flex min-h-svh">
      <aside className="bg-sidebar hidden w-64 shrink-0 flex-col border-r md:flex" aria-hidden="true">
        <div className="flex h-14 items-center gap-2.5 border-b px-3">
          <LogoMark />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>
        <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    </div>
  );
}
