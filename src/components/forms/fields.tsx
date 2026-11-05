"use client";

import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type BaseProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function Label({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {label}
      {required && (
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </FieldLabel>
  );
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
}: BaseProps<T> & {
  type?: "text" | "email" | "tel" | "url" | "password" | "number";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label htmlFor={id} label={label} required={required} />
          <Input
            {...field}
            value={field.value ?? ""}
            id={id}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
            aria-required={required}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  rows = 3,
  placeholder,
  maxLength,
}: BaseProps<T> & { rows?: number; placeholder?: string; maxLength?: number }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label htmlFor={id} label={label} required={required} />
          <Textarea
            {...field}
            value={field.value ?? ""}
            id={id}
            rows={rows}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/** Radix Select cannot use "" as an item value, so "no selection" uses a sentinel. */
const NONE = "__none";

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  options,
  placeholder = "Select…",
  noneLabel,
}: BaseProps<T> & {
  options: readonly { value: string; label: string; description?: string }[];
  placeholder?: string;
  /** When set, adds a clearable "none" option with this label. */
  noneLabel?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label htmlFor={id} label={label} required={required} />
          <Select
            value={field.value ? String(field.value) : noneLabel ? NONE : ""}
            onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
            disabled={disabled}
            name={field.name}
          >
            <SelectTrigger id={id} className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/** Rupee amount input. The form holds the typed string; the schema converts to paise. */
export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder = "0.00",
}: BaseProps<T> & { placeholder?: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label htmlFor={id} label={label} required={required} />
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>₹</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              {...field}
              value={field.value ?? ""}
              id={id}
              inputMode="decimal"
              autoComplete="off"
              placeholder={placeholder}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
              className="tabular-nums"
            />
          </InputGroup>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  min,
  max,
  suffix,
}: BaseProps<T> & { min?: number; max?: number; suffix?: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label htmlFor={id} label={label} required={required} />
          <InputGroup>
            <InputGroupInput
              {...field}
              value={field.value ?? ""}
              id={id}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
              className="tabular-nums"
            />
            {suffix && (
              <InputGroupAddon align="inline-end">
                <InputGroupText>{suffix}</InputGroupText>
              </InputGroupAddon>
            )}
          </InputGroup>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/** IST calendar date as "yyyy-MM-dd". */
export function DateField<T extends FieldValues>(props: BaseProps<T> & { min?: string; max?: string }) {
  return <NativeDateInput {...props} type="date" />;
}

/** IST wall-clock date and time as "yyyy-MM-ddTHH:mm". */
export function DateTimeField<T extends FieldValues>(props: BaseProps<T> & { min?: string; max?: string }) {
  return <NativeDateInput {...props} type="datetime-local" />;
}

function NativeDateInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  type,
  min,
  max,
}: BaseProps<T> & { type: "date" | "datetime-local"; min?: string; max?: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label htmlFor={id} label={label} required={required} />
          <Input
            {...field}
            value={field.value ?? ""}
            id={id}
            type={type}
            min={min}
            max={max}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
            className="tabular-nums"
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseProps<T>) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          orientation="horizontal"
          data-invalid={fieldState.invalid}
          className={cn("rounded-lg border p-3", className)}
        >
          <div className="flex flex-1 flex-col gap-0.5">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
          </div>
          <Switch
            id={id}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            disabled={disabled}
          />
        </Field>
      )}
    />
  );
}
