import { Schema } from "mongoose";
import { PRICING_UNITS, SERVICE_CATEGORIES } from "@/lib/constants";
import { paiseField, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const serviceSchema = new Schema(
  {
    name: trimmedString(150, true),
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    description: trimmedString(2000),
    basePricePaise: paiseField(),
    pricingUnit: { type: String, enum: PRICING_UNITS, required: true, default: "one_time" },
    /** SAC code printed on invoices when applicable (e.g. 998314). */
    sacCode: trimmedString(10),
    /** Suggested tax rate in basis points; null means "choose on the document". */
    defaultTaxRateBps: { type: Number, min: 0, max: 10_000, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

serviceSchema.index({ category: 1, isActive: 1, sortOrder: 1 });

export type ServiceDoc = LeanDoc<typeof serviceSchema>;
export const ServiceModel = defineModel("Service", serviceSchema);
