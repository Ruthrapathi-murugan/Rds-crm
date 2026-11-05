"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { DateTimeField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { useOptions } from "@/hooks/use-options";
import { api, handleFormError } from "@/lib/client/api";
import { optionsOf, PRIORITIES, PRIORITY_LABELS, REMINDER_OPTIONS, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/constants";
import { toDateTimeInputValue } from "@/lib/utils/date";
import { taskFormSchema, type TaskFormInput } from "@/lib/validations/task";
import type { Option } from "@/types";

export type TaskRelationOptions = { customer?: Option | null; lead?: Option | null; project?: Option | null };

const reminderOptions = REMINDER_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));

/** The next full hour, as an IST "yyyy-MM-ddTHH:mm" value. */
function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toDateTimeInputValue(d);
}

export function emptyTask(assignedTo: string, overrides: Partial<TaskFormInput> = {}): TaskFormInput {
  return {
    title: "",
    description: "",
    customer: "",
    lead: "",
    project: "",
    assignedTo,
    dueAt: "",
    priority: "medium",
    status: "todo",
    reminderMinutes: "60",
    ...overrides,
  };
}

export function TaskFormSheet({
  open,
  onOpenChange,
  taskId,
  initialValues,
  relationOptions = {},
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  taskId?: string;
  initialValues?: TaskFormInput;
  /** Labels for pre-selected customer / lead / project. */
  relationOptions?: TaskRelationOptions;
  currentUserId: string;
}) {
  const router = useRouter();
  const { options: users } = useOptions(open ? "/api/users/options" : null);

  const form = useForm<TaskFormInput>({
    resolver: zodResolver(taskFormSchema, undefined, { raw: true }),
    defaultValues: initialValues ?? emptyTask(currentUserId),
  });
  const customer = useWatch({ control: form.control, name: "customer" });

  useEffect(() => {
    if (!open) return;
    const values = initialValues ?? emptyTask(currentUserId);
    form.reset({ ...values, dueAt: values.dueAt || nextHour() });
  }, [open, initialValues, currentUserId, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (taskId) {
        await api(`/api/tasks/${taskId}`, { method: "PUT", body: values });
        toast.success("Task updated");
      } else {
        await api("/api/tasks", { body: values });
        toast.success("Task added");
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
      title={taskId ? "Edit task" : "New task"}
      description={taskId ? "Update the task or follow-up." : "Plan a follow-up call, a delivery step or any to-do."}
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel={taskId ? "Save changes" : "Add task"}
    >
      <FieldGroup>
        <TextField control={form.control} name="title" label="Title" required autoComplete="off" placeholder="e.g. Call Priya about menu photos" />
        <TextareaField control={form.control} name="description" label="Details" rows={3} maxLength={5000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField control={form.control} name="dueAt" label="Due" required className="sm:col-span-2" />
          <SelectField control={form.control} name="priority" label="Priority" options={optionsOf(PRIORITIES, PRIORITY_LABELS)} required />
          <SelectField control={form.control} name="status" label="Status" options={optionsOf(TASK_STATUSES, TASK_STATUS_LABELS)} required />
          <SelectField control={form.control} name="reminderMinutes" label="Reminder" options={reminderOptions} className="sm:col-span-2" />
        </div>
        <ComboboxField
          control={form.control}
          name="assignedTo"
          label="Assigned to"
          required
          clearable={false}
          options={users}
          placeholder="Choose a team member"
          searchPlaceholder="Search team…"
        />
        <FieldSeparator>Related to</FieldSeparator>
        <ComboboxField
          control={form.control}
          name="customer"
          label="Customer"
          optionsUrl="/api/customers/options"
          initialOptions={relationOptions.customer ? [relationOptions.customer] : []}
          placeholder="No customer"
          searchPlaceholder="Search customers…"
        />
        <ComboboxField
          control={form.control}
          name="lead"
          label="Lead"
          optionsUrl="/api/leads/options"
          initialOptions={relationOptions.lead ? [relationOptions.lead] : []}
          placeholder="No lead"
          searchPlaceholder="Search leads…"
        />
        <ComboboxField
          control={form.control}
          name="project"
          label="Project"
          optionsUrl={customer ? `/api/projects/options?customer=${customer}` : "/api/projects/options"}
          initialOptions={relationOptions.project ? [relationOptions.project] : []}
          placeholder="No project"
          searchPlaceholder="Search projects…"
          description={customer ? "Showing this customer's projects." : undefined}
        />
      </FieldGroup>
    </FormSheet>
  );
}
