"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { MoneyField, NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { invalidateOptions } from "@/hooks/use-options";
import { api, handleFormError } from "@/lib/client/api";
import { customSacOption, SAC_OPTIONS } from "@/lib/sac-codes";
import { PRICING_UNIT_LABELS, PRICING_UNITS, SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, optionsOf, type ServiceCategory } from "@/lib/constants";
import { serviceFormSchema, type ServiceFormInput } from "@/lib/validations/service";

/** A tax rate offered in the picker; `value` is the percentage string used by the form. */
export type TaxRateChoice = { value: string; label: string };

export function emptyService(category: ServiceCategory = "web_development"): ServiceFormInput {
  return {
    name: "",
    category,
    description: "",
    basePrice: "",
    pricingUnit: "one_time",
    sacCode: "",
    defaultTaxRate: "",
    isActive: true,
    sortOrder: "0",
  };
}

export function ServiceFormSheet({
  open,
  onOpenChange,
  serviceId,
  initialValues,
  taxRates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  serviceId?: string;
  initialValues?: ServiceFormInput;
  /** Active company tax rates (from Settings). */
  taxRates: TaxRateChoice[];
}) {
  const router = useRouter();
  const form = useForm<ServiceFormInput>({
    resolver: zodResolver(serviceFormSchema, undefined, { raw: true }),
    defaultValues: initialValues ?? emptyService(),
  });

  useEffect(() => {
    if (open) form.reset(initialValues ?? emptyService());
  }, [open, initialValues, form]);

  // Keep a rate that was deactivated in Settings selectable for the service that already uses it.
  const current = initialValues?.defaultTaxRate ? String(initialValues.defaultTaxRate) : "";
  const taxOptions =
    current && !taxRates.some((t) => t.value === current)
      ? [...taxRates, { value: current, label: `${current}% (no longer offered)` }]
      : taxRates;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (serviceId) {
        await api(`/api/services/${serviceId}`, { method: "PUT", body: values });
        toast.success("Service updated");
      } else {
        await api("/api/services", { body: values });
        toast.success(`${values.name} added to the catalogue`);
      }
      invalidateOptions("/api/services");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={serviceId ? "Edit service" : "New service"}
      description={
        serviceId
          ? "Changes apply to new quotations and invoices. Existing documents keep their prices."
          : "Add a service to the catalogue so it can be picked on leads, projects and documents."
      }
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel={serviceId ? "Save changes" : "Add service"}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Service name" required autoComplete="off" />
        <SelectField control={form.control} name="category" label="Category" options={optionsOf(SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS)} required />
        <TextareaField control={form.control} name="description" label="Description" rows={3} maxLength={2000} placeholder="What the client gets" />
        <FieldSeparator>Pricing and tax</FieldSeparator>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField control={form.control} name="basePrice" label="Base price" description="Leave blank to quote per client." />
          <SelectField control={form.control} name="pricingUnit" label="Billed" options={optionsOf(PRICING_UNITS, PRICING_UNIT_LABELS)} required />
          <ComboboxField
            control={form.control}
            name="sacCode"
            label="SAC code"
            options={SAC_OPTIONS}
            customOption={customSacOption}
            placeholder="Choose code"
            searchPlaceholder="Search code or service, or type a code…"
            emptyText="No match. Type a 4–8 digit code to use it."
            description="Filled in automatically on invoice and quotation lines for this service."
          />
          <SelectField
            control={form.control}
            name="defaultTaxRate"
            label="Default tax rate"
            options={taxOptions}
            noneLabel="Choose on each document"
            description="Rates come from Settings."
          />
        </div>
        <FieldSeparator>Display</FieldSeparator>
        <NumberField
          control={form.control}
          name="sortOrder"
          label="Sort order"
          min={0}
          max={1000}
          description="Lower numbers appear first within the category."
        />
        <SwitchField
          control={form.control}
          name="isActive"
          label="Active"
          description="Inactive services stay on existing records but cannot be picked for new work."
        />
      </FieldGroup>
    </FormSheet>
  );
}
