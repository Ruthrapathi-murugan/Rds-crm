import { z } from "zod";
import { PRIORITIES, PROJECT_STATUSES, SERVICE_CATEGORIES } from "@/lib/constants";
import { moneyInput, optionalDateInput, optionalObjectId, optionalText, requiredText } from "./common";

/** Whole percentage 0–100, typed as a string in forms or sent as a number. */
export const progressInput = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = typeof value === "number" ? String(value) : value.trim();
  const n = text === "" ? 0 : Number(text);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    ctx.addIssue({ code: "custom", message: "Enter a whole number from 0 to 100" });
    return z.NEVER;
  }
  return n;
});

const requiredCustomer = z
  .string({ error: "Choose a customer" })
  .regex(/^[a-f0-9]{24}$/i, "Choose a customer");

export const projectFormSchema = z
  .object({
    name: requiredText("Project name", 200),
    customer: requiredCustomer,
    service: optionalObjectId,
    /** When a service is chosen the server uses the service's category instead. */
    category: z.enum(SERVICE_CATEGORIES, { error: "Choose a category" }),
    description: optionalText(5000),
    startDate: optionalDateInput,
    dueDate: optionalDateInput,
    quotedAmount: moneyInput,
    advanceAmount: moneyInput,
    assignedTo: optionalObjectId,
    priority: z.enum(PRIORITIES),
    status: z.enum(PROJECT_STATUSES),
    progress: progressInput,
    internalNotes: optionalText(5000),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate.getTime() >= v.startDate.getTime(), {
    path: ["dueDate"],
    message: "Due date cannot be before the start date",
  })
  .refine((v) => v.advanceAmount <= v.quotedAmount, {
    path: ["advanceAmount"],
    message: "Advance cannot be more than the quoted amount",
  });
export type ProjectFormInput = z.input<typeof projectFormSchema>;
export type ProjectFormData = z.output<typeof projectFormSchema>;

export const projectStatusSchema = z.object({ status: z.enum(PROJECT_STATUSES) });
export type ProjectStatusInput = z.input<typeof projectStatusSchema>;

export const projectProgressSchema = z.object({ progress: progressInput });
export type ProjectProgressInput = z.input<typeof projectProgressSchema>;

export const checklistItemSchema = z.object({ title: requiredText("Checklist item", 300) });
export type ChecklistItemInput = z.input<typeof checklistItemSchema>;

export const checklistToggleSchema = z.object({ done: z.boolean() });
