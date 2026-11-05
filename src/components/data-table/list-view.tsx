"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, use, useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";

type ListContextValue = {
  isPending: boolean;
  params: URLSearchParams;
  defaultSort?: string;
  defaultDir: "asc" | "desc";
  /** Updates query parameters (null removes one). Resets to page 1 unless told otherwise. */
  setParams: (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => void;
};

const ListContext = createContext<ListContextValue | null>(null);

export function useListView() {
  const value = use(ListContext);
  if (!value) throw new Error("useListView must be used inside <ListView>");
  return value;
}

/**
 * Client wrapper for server-rendered lists. Search, filters, sorting and
 * pagination live in the URL; changes re-render the server component in a
 * transition while the current rows stay visible (dimmed via <ListBody>).
 */
export function ListView({
  children,
  defaultSort,
  defaultDir = "desc",
  className,
}: {
  children: React.ReactNode;
  defaultSort?: string;
  defaultDir?: "asc" | "desc";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParams = useCallback(
    (updates: Record<string, string | null>, options: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (options.resetPage ?? true) next.delete("page");
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  return (
    <ListContext value={{ isPending, params: searchParams as unknown as URLSearchParams, setParams, defaultSort, defaultDir }}>
      <div className={cn("animate-fade-up flex flex-col gap-4", className)} style={{ "--delay": "60ms" } as React.CSSProperties}>
        {children}
      </div>
    </ListContext>
  );
}

/** Dims its content while new results load. */
export function ListBody({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isPending } = useListView();
  return (
    <div data-pending={isPending} aria-busy={isPending} className={className}>
      {children}
    </div>
  );
}
