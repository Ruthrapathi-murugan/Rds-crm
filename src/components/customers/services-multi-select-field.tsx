"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Option } from "@/types";

/**
 * Searchable multi-select that stores an array of ids. Selected values are
 * shown as removable chips under the trigger. `initialOptions` supplies
 * labels for values no longer offered (e.g. a deactivated service).
 */
export function MultiSelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  initialOptions = [],
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches found.",
  disabled,
  className,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: React.ReactNode;
  options: readonly Option[];
  initialOptions?: readonly Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of [...initialOptions, ...options]) map.set(option.value, option.label);
    return map;
  }, [initialOptions, options]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = Array.isArray(field.value) ? field.value : [];
        const toggle = (value: string) =>
          field.onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
        return (
          <Field data-invalid={fieldState.invalid} className={className}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={id}
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-invalid={fieldState.invalid}
                  disabled={disabled}
                  onBlur={field.onBlur}
                  className={cn("h-9 w-full justify-between px-3 font-normal", selected.length === 0 && "text-muted-foreground")}
                >
                  <span className="truncate">
                    {selected.length === 0 ? placeholder : `${selected.length} selected`}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
                  <CommandList>
                    <CommandEmpty>{emptyText}</CommandEmpty>
                    <CommandGroup>
                      {visible.map((option) => {
                        const isSelected = selected.includes(option.value);
                        return (
                          <CommandItem key={option.value} value={option.value} onSelect={() => toggle(option.value)}>
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                              )}
                            >
                              {isSelected && <Check className="size-3 text-current" />}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate">{option.label}</span>
                              {option.description && (
                                <span className="text-muted-foreground truncate text-xs">{option.description}</span>
                              )}
                            </span>
                            <span className="sr-only">{isSelected ? "(selected)" : ""}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selected.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${label.toLowerCase()}`}>
                {selected.map((value) => {
                  const text = labels.get(value) ?? "Unknown";
                  return (
                    <li
                      key={value}
                      className="animate-pop bg-primary/8 text-foreground ring-primary/20 inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium ring-1 ring-inset"
                    >
                      <span className="truncate">{text}</span>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => toggle(value)}
                          className="text-muted-foreground hover:bg-primary/15 hover:text-foreground rounded-full p-0.5 transition-colors"
                          aria-label={`Remove ${text}`}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {description && <FieldDescription>{description}</FieldDescription>}
            <FieldError errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}
