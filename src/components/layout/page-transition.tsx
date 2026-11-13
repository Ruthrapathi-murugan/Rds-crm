"use client";

import { usePathname } from "next/navigation";

/**
 * Replays the page-enter animation on every route change. Keyed by pathname
 * only, so filter/sort/pagination changes (search params) don't remount the
 * page or lose its state.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in flex min-w-0 flex-1 flex-col gap-6">
      {children}
    </div>
  );
}
