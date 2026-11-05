"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { useListView } from "@/components/data-table/list-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** From/to IST calendar days plus the "routine activity" switch for the audit log. */
export function AuditFilters() {
  const { params, setParams } = useListView();
  const id = useId();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const showAll = params.get("all") === "1";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <fieldset className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <legend className="sr-only">Date range (IST)</legend>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-from`} className="text-muted-foreground w-10 shrink-0 font-normal sm:w-auto">
            From
          </Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setParams({ from: e.target.value || null })}
            className="flex-1 tabular-nums sm:w-40 sm:flex-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-to`} className="text-muted-foreground w-10 shrink-0 font-normal sm:w-auto">
            To
          </Label>
          <Input
            id={`${id}-to`}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setParams({ to: e.target.value || null })}
            className="flex-1 tabular-nums sm:w-40 sm:flex-none"
          />
        </div>
        {(from || to) && (
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setParams({ from: null, to: null })}>
            <X className="size-4" aria-hidden="true" />
            Clear dates
          </Button>
        )}
      </fieldset>
      <div className="flex items-center gap-2">
        <Switch id={`${id}-all`} checked={showAll} onCheckedChange={(checked) => setParams({ all: checked ? "1" : null })} />
        <Label htmlFor={`${id}-all`} className="font-normal">
          Include routine activity
        </Label>
      </div>
    </div>
  );
}
