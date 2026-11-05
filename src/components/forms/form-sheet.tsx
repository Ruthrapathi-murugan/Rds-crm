"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Slide-over panel for create/edit forms. The footer stays visible while the
 * body scrolls; closing is blocked while a save is in progress.
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitting,
  submitLabel = "Save",
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  submitLabel?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={(value) => !submitting && onOpenChange(value)}>
      <SheetContent
        className={cn(
          // Same data-[side] variants as the base Sheet so these widths win.
          "flex flex-col gap-0 p-0 data-[side=right]:w-full",
          wide ? "data-[side=right]:sm:max-w-2xl" : "data-[side=right]:sm:max-w-lg",
        )}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
