"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListView } from "./list-view";

const PAGE_SIZES = [10, 20, 50, 100];

export function ListPagination({
  page,
  pageCount,
  pageSize,
  total,
  noun = "records",
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  noun?: string;
}) {
  const { setParams } = useListView();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nf = new Intl.NumberFormat("en-IN");

  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Showing <span className="text-foreground font-medium">{nf.format(from)}</span>–
        <span className="text-foreground font-medium">{nf.format(to)}</span> of{" "}
        <span className="text-foreground font-medium">{nf.format(total)}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => setParams({ pageSize: v })}>
          <SelectTrigger size="sm" className="w-[110px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => setParams({ page: String(page - 1) }, { resetPage: false })}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm tabular-nums">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => setParams({ page: String(page + 1) }, { resetPage: false })}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
