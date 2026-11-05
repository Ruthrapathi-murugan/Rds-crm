import { Schema } from "mongoose";
import { ENTITY_TYPES } from "@/lib/constants";
import { objectIdRef, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

/**
 * Append-only activity and audit trail. Records are never edited or deleted
 * by the application. `sensitive` marks audit events (logins, permission and
 * financial changes) shown in the audit log.
 */
const activityLogSchema = new Schema(
  {
    actor: objectIdRef("User"),
    actorName: trimmedString(120),
    action: { type: String, required: true, maxlength: 80 },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId },
    entityLabel: trimmedString(200),
    message: trimmedString(500, true),
    sensitive: { type: Boolean, default: false },
    ipAddress: { type: String, maxlength: 64 },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ sensitive: 1, createdAt: -1 });
activityLogSchema.index({ actor: 1, createdAt: -1 });

export type ActivityLogDoc = LeanDoc<typeof activityLogSchema>;
export const ActivityLogModel = defineModel("ActivityLog", activityLogSchema);
