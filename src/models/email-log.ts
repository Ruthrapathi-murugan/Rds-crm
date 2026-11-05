import { Schema } from "mongoose";
import { ENTITY_TYPES } from "@/lib/constants";
import { defineModel, type LeanDoc } from "./model";
import { trimmedString } from "./_shared";

export const EMAIL_LOG_STATUSES = ["sent", "failed", "not_configured"] as const;

/**
 * Delivery record for every outgoing email. Bodies are never stored: they can
 * contain one-time codes and personal data. Kept for one year.
 */
const emailLogSchema = new Schema(
  {
    to: { ...trimmedString(500, true), lowercase: true },
    subject: trimmedString(300, true),
    /** Template key, e.g. "password_reset_otp", "invoice". */
    template: trimmedString(60, true),
    status: { type: String, enum: EMAIL_LOG_STATUSES, required: true },
    messageId: trimmedString(300),
    entityType: { type: String, enum: ENTITY_TYPES },
    entityId: { type: Schema.Types.ObjectId },
    sentBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

emailLogSchema.index({ template: 1, createdAt: -1 });
emailLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
emailLogSchema.index({ createdAt: 1 }, { name: "ttl_one_year", expireAfterSeconds: 365 * 24 * 60 * 60 });

export type EmailLogDoc = LeanDoc<typeof emailLogSchema>;
export const EmailLogModel = defineModel("EmailLog", emailLogSchema);
