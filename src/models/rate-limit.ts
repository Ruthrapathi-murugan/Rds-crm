import { Schema } from "mongoose";
import { defineModel } from "./model";

/** Fixed-window counters for rate limiting; shared by all serverless instances. */
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel = defineModel("RateLimit", rateLimitSchema);
