import { Schema } from "mongoose";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { communicationSchema, objectIdRef, paiseField, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const leadSchema = new Schema(
  {
    leadNumber: { type: String, required: true, unique: true },
    contactName: trimmedString(120, true),
    businessName: trimmedString(200),
    phone: trimmedString(30, true),
    whatsapp: trimmedString(30),
    email: { ...trimmedString(200), lowercase: true },
    location: trimmedString(200),
    interestedService: objectIdRef("Service"),
    source: { type: String, enum: LEAD_SOURCES, required: true },
    estimatedValuePaise: paiseField(),
    status: { type: String, enum: LEAD_STATUSES, required: true, default: "new" },
    assignedTo: objectIdRef("User"),
    nextFollowUpAt: { type: Date },
    notes: trimmedString(5000),
    lostReason: trimmedString(500),
    communications: { type: [communicationSchema], default: [] },
    convertedCustomer: objectIdRef("Customer"),
    convertedAt: { type: Date },
    archivedAt: { type: Date },
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

leadSchema.index({ archivedAt: 1, status: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ nextFollowUpAt: 1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ email: 1 });

export type LeadDoc = LeanDoc<typeof leadSchema>;
export const LeadModel = defineModel("Lead", leadSchema);
