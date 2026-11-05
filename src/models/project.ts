import { Schema } from "mongoose";
import { PRIORITIES, PROJECT_STATUSES, SERVICE_CATEGORIES } from "@/lib/constants";
import { objectIdRef, paiseField, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const checklistItemSchema = new Schema(
  {
    title: trimmedString(300, true),
    done: { type: Boolean, default: false },
    doneAt: { type: Date },
    doneBy: objectIdRef("User"),
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const projectSchema = new Schema(
  {
    projectNumber: { type: String, required: true, unique: true },
    name: trimmedString(200, true),
    customer: objectIdRef("Customer", true),
    service: objectIdRef("Service"),
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    description: trimmedString(5000),
    startDate: { type: Date },
    dueDate: { type: Date },
    quotedAmountPaise: paiseField(),
    /** Advance agreed with the client. Money actually received comes from Payments. */
    advanceAmountPaise: paiseField(),
    assignedTo: objectIdRef("User"),
    priority: { type: String, enum: PRIORITIES, required: true, default: "medium" },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: "not_started" },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    internalNotes: trimmedString(5000),
    checklist: { type: [checklistItemSchema], default: [] },
    sourceLead: objectIdRef("Lead"),
    completedAt: { type: Date },
    archivedAt: { type: Date },
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

projectSchema.index({ archivedAt: 1, status: 1, dueDate: 1 });
projectSchema.index({ customer: 1, createdAt: -1 });
projectSchema.index({ assignedTo: 1, status: 1 });
projectSchema.index({ category: 1 });

export type ProjectDoc = LeanDoc<typeof projectSchema>;
export const ProjectModel = defineModel("Project", projectSchema);
