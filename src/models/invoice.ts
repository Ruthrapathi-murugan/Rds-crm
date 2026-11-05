import { Schema } from "mongoose";
import { STORED_INVOICE_STATUSES, TAX_MODES } from "@/lib/constants";
import {
  billingSnapshotSchema,
  documentTotalsSchema,
  lineItemSchema,
  objectIdRef,
  paiseField,
  trimmedString,
} from "./_shared";
import { defineModel, type LeanDoc } from "./model";

/** Seller details frozen onto the invoice when it is issued. */
const sellerSnapshotSchema = new Schema(
  {
    name: trimmedString(200, true),
    address: trimmedString(500),
    stateName: trimmedString(100),
    stateCode: trimmedString(2),
    gstin: trimmedString(15),
    gstRegistered: { type: Boolean, default: false },
    email: trimmedString(200),
    phone: trimmedString(30),
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    /** Assigned only when the invoice is issued, so drafts never leave gaps in the series. */
    invoiceNumber: { type: String },
    customer: objectIdRef("Customer", true),
    billTo: { type: billingSnapshotSchema, required: true },
    seller: { type: sellerSnapshotSchema },
    project: objectIdRef("Project"),
    quotation: objectIdRef("Quotation"),
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    taxMode: { type: String, enum: TAX_MODES, required: true, default: "none" },
    placeOfSupply: trimmedString(100),
    items: { type: [lineItemSchema], required: true },
    totals: { type: documentTotalsSchema, required: true },
    amountPaidPaise: paiseField(),
    balancePaise: paiseField(),
    terms: trimmedString(5000),
    notes: trimmedString(2000),
    status: { type: String, enum: STORED_INVOICE_STATUSES, required: true, default: "draft" },
    issuedAt: { type: Date },
    sentAt: { type: Date },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: trimmedString(500),
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

invoiceSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: "string" } } },
);
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ customer: 1, issueDate: -1 });
invoiceSchema.index({ project: 1 });
invoiceSchema.index({ issueDate: -1 });

export type InvoiceDoc = LeanDoc<typeof invoiceSchema>;
export const InvoiceModel = defineModel("Invoice", invoiceSchema);
