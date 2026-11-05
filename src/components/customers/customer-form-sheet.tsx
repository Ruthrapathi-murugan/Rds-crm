"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { useOptions } from "@/hooks/use-options";
import { api, handleFormError } from "@/lib/client/api";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  INDIAN_STATES,
  optionsOf,
} from "@/lib/constants";
import { customerFormSchema, type CustomerFormInput } from "@/lib/validations/customer";
import type { Option } from "@/types";
import { MultiSelectField } from "./services-multi-select-field";

export const EMPTY_CUSTOMER: CustomerFormInput = {
  name: "",
  businessName: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  type: "small_business",
  status: "active",
  servicesPurchased: [],
  notes: "",
};

const STATE_OPTIONS: Option[] = INDIAN_STATES.map((s) => ({ value: s.name, label: s.name, description: `GST state code ${s.code}` }));

export function CustomerFormSheet({
  open,
  onOpenChange,
  customerId,
  initialValues,
  initialServices = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  customerId?: string;
  initialValues?: CustomerFormInput;
  /** Labels for services already on the record (some may be inactive now). */
  initialServices?: Option[];
}) {
  const router = useRouter();
  const { options: services } = useOptions(open ? "/api/services/options" : null);

  const form = useForm<CustomerFormInput>({
    resolver: zodResolver(customerFormSchema, undefined, { raw: true }),
    defaultValues: initialValues ?? EMPTY_CUSTOMER,
  });

  useEffect(() => {
    if (open) form.reset(initialValues ?? EMPTY_CUSTOMER);
  }, [open, initialValues, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (customerId) {
        await api(`/api/customers/${customerId}`, { method: "PUT", body: values });
        toast.success("Customer updated");
      } else {
        const created = await api<{ id: string; customerNumber: string }>("/api/customers", { body: values });
        toast.success(`Customer ${created.customerNumber} created`, {
          action: { label: "Open", onClick: () => router.push(`/customers/${created.id}`) },
        });
      }
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
      title={customerId ? "Edit customer" : "New customer"}
      description={
        customerId
          ? "Update contact, billing and service details."
          : "Add a customer directly. Customers converted from leads are created automatically."
      }
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel={customerId ? "Save changes" : "Create customer"}
      wide
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="name" label="Contact name" required autoComplete="off" />
          <TextField control={form.control} name="businessName" label="Business name" autoComplete="off" />
          <TextField control={form.control} name="phone" label="Phone" type="tel" required inputMode="tel" />
          <TextField control={form.control} name="whatsapp" label="WhatsApp" type="tel" inputMode="tel" />
          <TextField control={form.control} name="email" label="Email" type="email" className="sm:col-span-2" />
          <SelectField control={form.control} name="type" label="Customer type" options={optionsOf(CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS)} required />
          <SelectField control={form.control} name="status" label="Status" options={optionsOf(CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS)} required />
        </div>
        <FieldSeparator>Billing address</FieldSeparator>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextareaField
            control={form.control}
            name="address"
            label="Address"
            rows={2}
            maxLength={500}
            placeholder="Door no., street, area"
            className="sm:col-span-2"
          />
          <TextField control={form.control} name="city" label="City" placeholder="e.g. Palani" />
          <TextField control={form.control} name="pincode" label="PIN code" inputMode="numeric" maxLength={6} />
          <ComboboxField
            control={form.control}
            name="state"
            label="State"
            options={STATE_OPTIONS}
            placeholder="Choose a state"
            searchPlaceholder="Search states…"
            description="Decides CGST + SGST or IGST on invoices."
          />
          <TextField
            control={form.control}
            name="gstin"
            label="GSTIN"
            placeholder="15-character GSTIN"
            maxLength={15}
            autoComplete="off"
            description="Leave blank for unregistered customers."
          />
        </div>
        <FieldSeparator>Services</FieldSeparator>
        <MultiSelectField
          control={form.control}
          name="servicesPurchased"
          label="Services purchased"
          options={services}
          initialOptions={initialServices}
          placeholder="Choose services"
          searchPlaceholder="Search services…"
        />
        <TextareaField control={form.control} name="notes" label="Notes" rows={4} maxLength={5000} />
      </FieldGroup>
    </FormSheet>
  );
}
