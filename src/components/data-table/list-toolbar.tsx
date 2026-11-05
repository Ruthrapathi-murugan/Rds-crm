"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListView } from "./list-view";

export type ListFilter = {
  key: string;
  label: string;
  options: readonly { value: string; label: string }[];
};

const ALL = "__all";

export function ListToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  children,
}: {
  searchPlaceholder?: string;
  filters?: ListFilter[];
  children?: React.ReactNode;
}) {
  const { params, setParams, isPending } = useListView();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const lastSent = useRef(urlQuery);

  // Debounce typing into the URL.
  useEffect(() => {
    if (query === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = query;
      setParams({ q: query.trim() || null });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, setParams]);

  const activeFilters = filters.filter((f) => params.get(f.key));

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </InputGroup>
        {filters.map((filter) => (
          <Select
            key={filter.key}
            value={params.get(filter.key) ?? ALL}
            onValueChange={(value) => setParams({ [filter.key]: value === ALL ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-auto sm:min-w-40" aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All {filter.label.toLowerCase()}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {(activeFilters.length > 0 || urlQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              lastSent.current = "";
              setQuery("");
              setParams(Object.fromEntries([["q", null], ...filters.map((f) => [f.key, null])]));
            }}
          >
            <X className="size-4" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
