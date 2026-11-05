import { Schema } from "mongoose";
import { QUOTATION_STATUSES, TAX_MODES } from "@/lib/constants";
import { billingSnapshotSchema, documentTotalsSchema, lineItemSchema, objectIdRef, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const quotationSchema = new Schema(
  {
    quotationNumber: { type: String, required: true, unique: true },
    customer: objectIdRef("Customer", true),
    billTo: { type: billingSnapshotSchema, required: true },
    lead: objectIdRef("Lead"),
    project: objectIdRef("Project"),
    issueDate: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    taxMode: { type: String, enum: TAX_MODES, required: true, default: "none" },
    items: { type: [lineItemSchema], required: true },
    totals: { type: documentTotalsSchema, required: true },
    terms: trimmedString(5000),
    notes: trimmedString(2000),
    status: { type: String, enum: QUOTATION_STATUSES, required: true, default: "draft" },
    sentAt: { type: Date },
    convertedInvoice: objectIdRef("Invoice"),
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

quotationSchema.index({ status: 1, issueDate: -1 });
quotationSchema.index({ customer: 1, issueDate: -1 });

export type QuotationDoc = LeanDoc<typeof quotationSchema>;
export const QuotationModel = defineModel("Quotation", quotationSchema);
