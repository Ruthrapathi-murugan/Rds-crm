"use client";

import { CalendarRange, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_PRESETS } from "@/lib/report-range";

const CUSTOM = "custom";

/** Date range for reports: a preset, or custom from/to dates (IST calendar days). */
export function RangePicker({ preset, from, to }: { preset: string | null; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState(preset ?? CUSTOM);
  const [fromValue, setFrom] = useState(from);
  const [toValue, setTo] = useState(to);

  function navigate(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Select
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          if (value !== CUSTOM) navigate({ range: value, from: null, to: null });
        }}
      >
        <SelectTrigger className="w-full sm:w-52" aria-label="Report period">
          <CalendarRange className="size-4" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom dates…</SelectItem>
        </SelectContent>
      </Select>
      {mode === CUSTOM && (
        <form
          className="animate-fade-in flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (fromValue && toValue && fromValue <= toValue) navigate({ range: null, from: fromValue, to: toValue });
          }}
        >
          <Input type="date" value={fromValue} max={toValue} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-auto" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={toValue} min={fromValue} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-auto" />
          <Button type="submit" variant="outline" disabled={!fromValue || !toValue || fromValue > toValue}>
            Apply
          </Button>
        </form>
      )}
      {pending && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Updating" />}
    </div>
  );
}
