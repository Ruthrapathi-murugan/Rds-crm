import { Schema } from "mongoose";
import { defineModel, type LeanDoc } from "./model";

/**
 * One in-progress "forgot password" flow per user.
 *
 * Step 1 stores an HMAC of a 6-digit email OTP (never the code itself).
 * Step 2 exchanges a correct OTP for a short-lived reset token (again stored
 * only as an HMAC). Step 3 consumes the token and deletes the record.
 * MongoDB removes abandoned records via the TTL index on `expiresAt`.
 */
const passwordResetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    otpHash: { type: String },
    otpExpiresAt: { type: Date },
    /** Wrong guesses against the current OTP; the OTP is discarded at the limit. */
    attempts: { type: Number, required: true, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetSchema.index({ resetTokenHash: 1 }, { unique: true, sparse: true });

export type PasswordResetDoc = LeanDoc<typeof passwordResetSchema>;
export const PasswordResetModel = defineModel("PasswordReset", passwordResetSchema);
