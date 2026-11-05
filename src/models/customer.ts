import { Schema } from "mongoose";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "@/lib/constants";
import { communicationSchema, objectIdRef, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const customerSchema = new Schema(
  {
    customerNumber: { type: String, required: true, unique: true },
    name: trimmedString(120, true),
    businessName: trimmedString(200),
    phone: trimmedString(30, true),
    whatsapp: trimmedString(30),
    email: { ...trimmedString(200), lowercase: true },
    address: trimmedString(500),
    city: trimmedString(100),
    state: trimmedString(100),
    pincode: trimmedString(10),
    gstin: { ...trimmedString(15), uppercase: true },
    type: { type: String, enum: CUSTOMER_TYPES, required: true, default: "small_business" },
    servicesPurchased: { type: [{ type: Schema.Types.ObjectId, ref: "Service" }], default: [] },
    status: { type: String, enum: CUSTOMER_STATUSES, required: true, default: "active" },
    notes: trimmedString(5000),
    communications: { type: [communicationSchema], default: [] },
    // Set when created from a lead; unique so a lead can only be converted once.
    sourceLead: objectIdRef("Lead"),
    archivedAt: { type: Date },
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

customerSchema.index(
  { sourceLead: 1 },
  { unique: true, partialFilterExpression: { sourceLead: { $type: "objectId" } } },
);
customerSchema.index({ archivedAt: 1, status: 1, createdAt: -1 });
customerSchema.index({ type: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ name: 1 });

export type CustomerDoc = LeanDoc<typeof customerSchema>;
export const CustomerModel = defineModel("Customer", customerSchema);
