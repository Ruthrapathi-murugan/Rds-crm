import { LogoMark } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { AppBackground } from "./app-background";

/** Static frame shown instantly while the session is verified. Mirrors the floating layout. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <AppBackground />
      <aside className="hidden w-64 shrink-0 p-2 md:flex" aria-hidden="true">
        <div className="glass-panel flex w-full flex-col rounded-2xl">
          <div className="flex h-16 items-center gap-2.5 px-3">
            <LogoMark className="size-9" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-2 pt-2 md:pl-0">
          <div className="glass-panel flex h-14 items-center gap-3 rounded-2xl px-4">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="ml-auto h-9 w-56 rounded-xl" />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
