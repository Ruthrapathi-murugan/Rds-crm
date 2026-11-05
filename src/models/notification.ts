import { Schema } from "mongoose";
import { objectIdRef, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const notificationSchema = new Schema(
  {
    user: objectIdRef("User", true),
    type: { type: String, required: true, maxlength: 50 },
    title: trimmedString(200, true),
    message: trimmedString(500),
    link: trimmedString(300),
    readAt: { type: Date },
    /** Prevents the same reminder being created twice. */
    dedupeKey: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);
// Read notifications are removed after 90 days.
notificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90, partialFilterExpression: { readAt: { $type: "date" } } },
);

export type NotificationDoc = LeanDoc<typeof notificationSchema>;
export const NotificationModel = defineModel("Notification", notificationSchema);
