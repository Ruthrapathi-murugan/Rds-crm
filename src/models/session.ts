import { Schema } from "mongoose";
import { defineModel, type LeanDoc } from "./model";

/**
 * Server-side login sessions. The cookie holds a random token; only an HMAC
 * of it is stored, so a database leak cannot be replayed as a login.
 */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    ipAddress: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = LeanDoc<typeof sessionSchema>;
export const SessionModel = defineModel("Session", sessionSchema);
