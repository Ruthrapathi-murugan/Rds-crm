import { z } from "zod";
import { PRIORITIES, REMINDER_MINUTES, TASK_STATUSES } from "@/lib/constants";
import { dateTimeInput, optionalObjectId, optionalText, requiredText } from "./common";

/** Reminder lead time; the select posts a string, the API may send a number. */
export const reminderMinutesInput = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    const n = value === undefined || value === "" ? 0 : Number(value);
    if (!(REMINDER_MINUTES as readonly number[]).includes(n)) {
      ctx.addIssue({ code: "custom", message: "Choose a reminder from the list" });
      return z.NEVER;
    }
    return n;
  });

export const taskFormSchema = z.object({
  title: requiredText("Title", 200),
  description: optionalText(5000),
  customer: optionalObjectId,
  lead: optionalObjectId,
  project: optionalObjectId,
  assignedTo: z
    .string({ error: "Choose who will do this" })
    .regex(/^[a-f0-9]{24}$/i, "Choose who will do this"),
  /** IST wall-clock time ("yyyy-MM-ddTHH:mm"). */
  dueAt: dateTimeInput,
  priority: z.enum(PRIORITIES),
  status: z.enum(TASK_STATUSES),
  reminderMinutes: reminderMinutesInput,
});
export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormData = z.output<typeof taskFormSchema>;

export const taskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });
export type TaskStatusInput = z.input<typeof taskStatusSchema>;

export const TASK_VIEWS = ["today", "upcoming", "overdue", "completed", "all"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];
