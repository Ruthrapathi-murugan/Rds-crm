import { Schema } from "mongoose";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/lib/constants";
import { objectIdRef, paiseField, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const paymentSchema = new Schema(
  {
    paymentNumber: { type: String, required: true, unique: true },
    customer: objectIdRef("Customer", true),
    invoice: objectIdRef("Invoice"),
    project: objectIdRef("Project"),
    paidAt: { type: Date, required: true },
    amountPaise: { ...paiseField({ required: true }), min: 1 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    transactionReference: trimmedString(120),
    notes: trimmedString(1000),
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: "recorded" },
    /** Client-generated id per form submission; makes double-submits harmless. */
    idempotencyKey: { type: String, maxlength: 100 },
    voidedAt: { type: Date },
    voidedBy: objectIdRef("User"),
    voidReason: trimmedString(500),
    createdBy: objectIdRef("User", true),
  },
  { timestamps: true },
);

paymentSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
// The same bank/UPI reference cannot be recorded twice while active.
paymentSchema.index(
  { method: 1, transactionReference: 1 },
  {
    unique: true,
    partialFilterExpression: { transactionReference: { $type: "string" }, status: "recorded" },
  },
);
paymentSchema.index({ status: 1, paidAt: -1 });
paymentSchema.index({ customer: 1, paidAt: -1 });
paymentSchema.index({ invoice: 1 });
paymentSchema.index({ project: 1 });

export type PaymentDoc = LeanDoc<typeof paymentSchema>;
export const PaymentModel = defineModel("Payment", paymentSchema);
