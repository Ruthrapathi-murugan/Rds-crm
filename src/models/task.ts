import { Schema } from "mongoose";
import { PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { objectIdRef, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const taskSchema = new Schema(
  {
    title: trimmedString(200, true),
    description: trimmedString(5000),
    customer: objectIdRef("Customer"),
    lead: objectIdRef("Lead"),
    project: objectIdRef("Project"),
    assignedTo: objectIdRef("User", true),
    dueAt: { type: Date, required: true },
    priority: { type: String, enum: PRIORITIES, required: true, default: "medium" },
    status: { type: String, enum: TASK_STATUSES, required: true, default: "todo" },
    /** Minutes before `dueAt` to send a reminder; 0 disables reminders. */
    reminderMinutes: { type: Number, default: 0, min: 0 },
    remindAt: { type: Date },
    reminderSentAt: { type: Date },
    completedAt: { type: Date },
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

taskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
taskSchema.index({ status: 1, dueAt: 1 });
taskSchema.index({ remindAt: 1, reminderSentAt: 1 });
taskSchema.index({ customer: 1 });
taskSchema.index({ lead: 1 });
taskSchema.index({ project: 1 });

export type TaskDoc = LeanDoc<typeof taskSchema>;
export const TaskModel = defineModel("Task", taskSchema);
