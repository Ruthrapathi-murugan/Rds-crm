"use client";

import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { Option } from "@/types";

/**
 * Searchable single-select. Give it static `options`, or an `optionsUrl`
 * that returns Option[] for `?q=` (searched on the server). Pass
 * `initialOptions` so an existing value shows its label before any search.
 */
export function ComboboxField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  options: staticOptions,
  optionsUrl,
  initialOptions = [],
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches found.",
  clearable = true,
  onSelectOption,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  options?: readonly Option[];
  optionsUrl?: string;
  initialOptions?: readonly Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  onSelectOption?: (option: Option | null) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  // The option picked most recently, so its label survives new searches.
  const [picked, setPicked] = useState<Option | null>(null);
  const findOption = (value: string) =>
    [picked, ...initialOptions, ...(staticOptions ?? []), ...remote].find((o) => o?.value === value) ?? undefined;

  useEffect(() => {
    if (!optionsUrl || !open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const separator = optionsUrl.includes("?") ? "&" : "?";
        const result = await api<Option[]>(`${optionsUrl}${separator}q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setRemote(result);
      } catch {
        // Keep previous results; the user can retry by typing.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [optionsUrl, open, query]);

  const visible = useMemo(() => {
    if (optionsUrl) return remote;
    const q = query.trim().toLowerCase();
    const all = staticOptions ?? [];
    return q ? all.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().includes(q)) : all;
  }, [optionsUrl, remote, staticOptions, query]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected = field.value ? findOption(String(field.value)) : undefined;
        return (
          <Field data-invalid={fieldState.invalid} className={className}>
            <FieldLabel htmlFor={id}>
              {label}
              {required && (
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              )}
            </FieldLabel>
            <Popover open={open} onOpenChange={setOpen}>
              <div className="relative">
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
                    className={cn(
                      "h-9 w-full justify-between px-3 font-normal",
                      !selected && "text-muted-foreground",
                      clearable && selected && "pr-14",
                    )}
                  >
                    <span className="truncate">{selected ? selected.label : field.value ? "Selected" : placeholder}</span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                {clearable && field.value && !disabled && (
                  <button
                    type="button"
                    onClick={() => {
                      field.onChange("");
                      onSelectOption?.(null);
                    }}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-8 -translate-y-1/2 rounded p-0.5"
                    aria-label={`Clear ${label}`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
                  <CommandList>
                    {loading && (
                      <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Searching…
                      </div>
                    )}
                    {!loading && <CommandEmpty>{emptyText}</CommandEmpty>}
                    <CommandGroup>
                      {visible.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          onSelect={() => {
                            setPicked(option);
                            field.onChange(option.value);
                            onSelectOption?.(option);
                            setOpen(false);
                            setQuery("");
                          }}
                        >
                          <Check
                            className={cn("size-4", field.value === option.value ? "opacity-100" : "opacity-0")}
                            aria-hidden="true"
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{option.label}</span>
                            {option.description && (
                              <span className="text-muted-foreground truncate text-xs">{option.description}</span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {description && <FieldDescription>{description}</FieldDescription>}
            <FieldError errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}
