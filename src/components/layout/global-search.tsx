"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_GROUPS } from "@/config/nav";
import { api } from "@/lib/client/api";
import type { Permission } from "@/lib/permissions";

type Result = { id: string; group: string; title: string; subtitle: string; href: string };

/** Ctrl/⌘+K command palette: jump to pages and search records. */
export function GlobalSearch({ permissions }: { permissions: Permission[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await api<Result[]>(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }));
      } catch {
        // Ignore: aborted or transient; the next keystroke retries.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pages = useMemo(
    () =>
      NAV_GROUPS.flatMap((g) => g.items).filter((item) => !item.permission || permissions.includes(item.permission)),
    [permissions],
  );
  const q = query.trim().toLowerCase();
  const matchingPages = q ? pages.filter((p) => p.title.toLowerCase().includes(q)) : pages;
  const visibleResults = q.length >= 2 ? results : [];
  const grouped = visibleResults.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:border-primary/40 h-9 w-9 justify-start gap-2 rounded-xl px-0 sm:w-56 sm:px-3 lg:w-64"
        aria-label="Search"
      >
        <Search className="mx-auto size-4 sm:mx-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search CRM…</span>
        <kbd className="bg-muted pointer-events-none hidden rounded border px-1.5 font-mono text-[10px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search records and pages">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search leads, customers, projects, invoices…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Searching…
              </div>
            )}
            <CommandEmpty>No results for “{query}”.</CommandEmpty>
            {Object.entries(grouped).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => (
                  <CommandItem key={`${group}-${item.id}`} value={`${group}-${item.id}`} onSelect={() => go(item.href)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.title}</span>
                      {item.subtitle && <span className="text-muted-foreground truncate text-xs">{item.subtitle}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {matchingPages.length > 0 && (
              <CommandGroup heading="Go to">
                {matchingPages.map((page) => (
                  <CommandItem key={page.href} value={`page-${page.href}`} onSelect={() => go(page.href)}>
                    <page.icon aria-hidden="true" />
                    {page.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
