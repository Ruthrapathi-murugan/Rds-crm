import { Schema } from "mongoose";
import { basisPointsField, trimmedString } from "./_shared";
import { defineModel, type LeanDoc } from "./model";

const taxRateSchema = new Schema({
  label: trimmedString(60, true),
  rateBps: basisPointsField,
  isActive: { type: Boolean, default: true },
});

/** Single document (key "default") holding editable business settings. */
const companySettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    companyName: trimmedString(200, true),
    legalName: trimmedString(200),
    email: trimmedString(200),
    phone: trimmedString(30),
    website: trimmedString(200),
    addressLine1: trimmedString(200),
    addressLine2: trimmedString(200),
    city: trimmedString(100),
    state: trimmedString(100),
    pincode: trimmedString(10),
    /** Only when true (and a GSTIN is set) may invoices be titled "Tax Invoice". */
    gstRegistered: { type: Boolean, default: false },
    gstin: { ...trimmedString(15), uppercase: true },
    pan: { ...trimmedString(10), uppercase: true },
    bankName: trimmedString(120),
    bankAccountName: trimmedString(120),
    bankAccountNumber: trimmedString(40),
    bankIfsc: { ...trimmedString(11), uppercase: true },
    upiId: trimmedString(100),
    invoicePrefix: { type: String, trim: true, maxlength: 5, default: "RDS" },
    quotationPrefix: { type: String, trim: true, maxlength: 5, default: "RDSQ" },
    defaultPaymentTermsDays: { type: Number, min: 0, max: 365, default: 15 },
    defaultQuotationValidityDays: { type: Number, min: 1, max: 365, default: 30 },
    quotationTerms: trimmedString(5000),
    invoiceTerms: trimmedString(5000),
    taxRates: { type: [taxRateSchema], default: [] },
  },
  { timestamps: true },
);

export type CompanySettingsDoc = LeanDoc<typeof companySettingsSchema>;
export const CompanySettingsModel = defineModel("CompanySettings", companySettingsSchema);
