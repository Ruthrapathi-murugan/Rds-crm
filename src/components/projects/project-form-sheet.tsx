"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { DateField, MoneyField, NumberField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { useOptions } from "@/hooks/use-options";
import { api, handleFormError } from "@/lib/client/api";
import {
  optionsOf,
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/constants";
import { projectFormSchema, type ProjectFormInput } from "@/lib/validations/project";
import type { Option } from "@/types";

export const EMPTY_PROJECT: ProjectFormInput = {
  name: "",
  customer: "",
  service: "",
  category: "web_development",
  description: "",
  startDate: "",
  dueDate: "",
  quotedAmount: "",
  advanceAmount: "",
  assignedTo: "",
  priority: "medium",
  status: "not_started",
  progress: "0",
  internalNotes: "",
};

export function ProjectFormSheet({
  open,
  onOpenChange,
  projectId,
  initialValues,
  customerOption,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  projectId?: string;
  initialValues?: ProjectFormInput;
  /** Label for a pre-selected customer. */
  customerOption?: Option | null;
}) {
  const router = useRouter();
  const { options: services } = useOptions(open ? "/api/services/options" : null);
  const { options: users } = useOptions(open ? "/api/users/options" : null);

  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(projectFormSchema, undefined, { raw: true }),
    defaultValues: initialValues ?? EMPTY_PROJECT,
  });
  const service = useWatch({ control: form.control, name: "service" });
  const status = useWatch({ control: form.control, name: "status" });

  useEffect(() => {
    if (open) form.reset(initialValues ?? EMPTY_PROJECT);
  }, [open, initialValues, form]);

  // The service decides the category; keep the field in step when a service is picked.
  useEffect(() => {
    if (!service) return;
    const match = services.find((s) => s.value === service) as (Option & { category?: ServiceCategory }) | undefined;
    if (match?.category && form.getValues("category") !== match.category) {
      form.setValue("category", match.category, { shouldDirty: true });
    }
  }, [service, services, form]);

  useEffect(() => {
    if (status === "completed") form.setValue("progress", "100");
  }, [status, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (projectId) {
        await api(`/api/projects/${projectId}`, { method: "PUT", body: values });
        toast.success("Project updated");
      } else {
        const created = await api<{ id: string; projectNumber: string }>("/api/projects", { body: values });
        toast.success(`Project ${created.projectNumber} created`, {
          action: { label: "Open", onClick: () => router.push(`/projects/${created.id}`) },
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
      title={projectId ? "Edit project" : "New project"}
      description={projectId ? "Update scope, schedule and amounts." : "Start tracking delivery for a customer."}
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel={projectId ? "Save changes" : "Create project"}
      wide
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Project name" required autoComplete="off" placeholder="e.g. Hotel website redesign" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            control={form.control}
            name="customer"
            label="Customer"
            required
            optionsUrl="/api/customers/options"
            initialOptions={customerOption ? [customerOption] : []}
            placeholder="Choose a customer"
            searchPlaceholder="Search customers…"
            clearable={false}
            className="sm:col-span-2"
          />
          <ComboboxField
            control={form.control}
            name="service"
            label="Service"
            options={services}
            placeholder="Choose a service"
            searchPlaceholder="Search services…"
          />
          <SelectField
            control={form.control}
            name="category"
            label="Category"
            options={optionsOf(SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS)}
            disabled={Boolean(service)}
            description={service ? "Set by the chosen service." : undefined}
            required
          />
        </div>
        <TextareaField control={form.control} name="description" label="Scope / description" rows={3} maxLength={5000} />
        <FieldSeparator />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField control={form.control} name="startDate" label="Start date" />
          <DateField control={form.control} name="dueDate" label="Due date" />
          <MoneyField control={form.control} name="quotedAmount" label="Quoted amount" />
          <MoneyField
            control={form.control}
            name="advanceAmount"
            label="Advance agreed"
            description="Money received is tracked through payments."
          />
        </div>
        <FieldSeparator />
        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            control={form.control}
            name="assignedTo"
            label="Assigned to"
            options={users}
            placeholder="Unassigned"
            searchPlaceholder="Search team…"
          />
          <SelectField control={form.control} name="priority" label="Priority" options={optionsOf(PRIORITIES, PRIORITY_LABELS)} required />
          <SelectField control={form.control} name="status" label="Status" options={optionsOf(PROJECT_STATUSES, PROJECT_STATUS_LABELS)} required />
          <NumberField control={form.control} name="progress" label="Progress" min={0} max={100} suffix="%" disabled={status === "completed"} />
        </div>
        <TextareaField
          control={form.control}
          name="internalNotes"
          label="Internal notes"
          description="Visible to your team only."
          rows={3}
          maxLength={5000}
        />
      </FieldGroup>
    </FormSheet>
  );
}
