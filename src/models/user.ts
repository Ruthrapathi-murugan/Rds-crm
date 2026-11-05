import { Schema } from "mongoose";
import { ROLES } from "@/lib/constants";
import { trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const userSchema = new Schema(
  {
    name: trimmedString(120, true),
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200, unique: true },
    phone: trimmedString(30),
    role: { type: String, enum: ROLES, required: true, default: "staff" },
    // Never returned unless explicitly selected with "+passwordHash".
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isActive: 1 });

export type UserDoc = LeanDoc<typeof userSchema>;
export const UserModel = defineModel("User", userSchema);
