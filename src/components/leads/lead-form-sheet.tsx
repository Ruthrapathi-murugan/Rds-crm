"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { DateTimeField, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { useOptions } from "@/hooks/use-options";
import { api, handleFormError } from "@/lib/client/api";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES, LEAD_STATUS_LABELS, LEAD_STATUSES, optionsOf } from "@/lib/constants";
import { leadFormSchema, type LeadFormInput } from "@/lib/validations/lead";

export const EMPTY_LEAD: LeadFormInput = {
  contactName: "",
  businessName: "",
  phone: "",
  whatsapp: "",
  email: "",
  location: "",
  interestedService: "",
  source: "website",
  estimatedValue: "",
  status: "new",
  assignedTo: "",
  nextFollowUpAt: "",
  notes: "",
};

const statusOptions = optionsOf(LEAD_STATUSES, LEAD_STATUS_LABELS).filter((o) => o.value !== "won");

export function LeadFormSheet({
  open,
  onOpenChange,
  leadId,
  initialValues,
  converted = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  leadId?: string;
  initialValues?: LeadFormInput;
  converted?: boolean;
}) {
  const router = useRouter();
  const { options: services } = useOptions(open ? "/api/services/options" : null);
  const { options: users } = useOptions(open ? "/api/users/options" : null);

  const form = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema, undefined, { raw: true }),
    defaultValues: initialValues ?? EMPTY_LEAD,
  });

  useEffect(() => {
    if (open) form.reset(initialValues ?? EMPTY_LEAD);
  }, [open, initialValues, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (leadId) {
        await api(`/api/leads/${leadId}`, { method: "PUT", body: values });
        toast.success("Lead updated");
      } else {
        const created = await api<{ id: string; leadNumber: string }>("/api/leads", { body: values });
        toast.success(`Lead ${created.leadNumber} created`, {
          action: { label: "Open", onClick: () => router.push(`/leads/${created.id}`) },
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
      title={leadId ? "Edit lead" : "New lead"}
      description={leadId ? "Update the enquiry details." : "Capture a new enquiry. You can log calls and follow-ups after saving."}
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel={leadId ? "Save changes" : "Create lead"}
      wide
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="contactName" label="Contact name" required autoComplete="off" />
          <TextField control={form.control} name="businessName" label="Business name" autoComplete="off" />
          <TextField control={form.control} name="phone" label="Phone" type="tel" required inputMode="tel" />
          <TextField control={form.control} name="whatsapp" label="WhatsApp" type="tel" inputMode="tel" />
          <TextField control={form.control} name="email" label="Email" type="email" />
          <TextField control={form.control} name="location" label="Business location" placeholder="e.g. Palani" />
        </div>
        <FieldSeparator />
        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            control={form.control}
            name="interestedService"
            label="Interested service"
            options={services}
            placeholder="Choose a service"
            searchPlaceholder="Search services…"
            className="sm:col-span-2"
          />
          <SelectField control={form.control} name="source" label="Lead source" options={optionsOf(LEAD_SOURCES, LEAD_SOURCE_LABELS)} required />
          <SelectField
            control={form.control}
            name="status"
            label="Status"
            options={converted ? optionsOf(LEAD_STATUSES, LEAD_STATUS_LABELS) : statusOptions}
            disabled={converted}
            required
          />
          <MoneyField control={form.control} name="estimatedValue" label="Estimated project value" />
          <ComboboxField
            control={form.control}
            name="assignedTo"
            label="Assigned to"
            options={users}
            placeholder="Unassigned"
            searchPlaceholder="Search team…"
          />
          <DateTimeField
            control={form.control}
            name="nextFollowUpAt"
            label="Next follow-up"
            description="Shown on the dashboard and in follow-up filters."
            className="sm:col-span-2"
          />
        </div>
        <TextareaField control={form.control} name="notes" label="Notes" rows={4} maxLength={5000} />
      </FieldGroup>
    </FormSheet>
  );
}
