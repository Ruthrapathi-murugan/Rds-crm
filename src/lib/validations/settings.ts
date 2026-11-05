import { z } from "zod";
import { INDIAN_STATE_NAMES } from "@/lib/constants";
import { DOCUMENT_PREFIX_PATTERN } from "@/lib/finance/numbering";
import { optionalEmail, optionalGstin, optionalPhone, optionalText, percentInput, requiredText } from "./common";

export const taxRateInput = z.object({
  id: z.string().optional(),
  label: requiredText("Label", 60),
  rate: percentInput,
  isActive: z.boolean().default(true),
});

export const companySettingsSchema = z
  .object({
    companyName: requiredText("Company name", 200),
    legalName: optionalText(200),
    email: optionalEmail,
    phone: optionalPhone,
    website: optionalText(200),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    state: z.union([z.enum(INDIAN_STATE_NAMES as [string, ...string[]]), z.literal("")]).default(""),
    pincode: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{6}$/.test(v), "Enter a 6-digit PIN code")
      .default(""),
    gstRegistered: z.boolean(),
    gstin: optionalGstin,
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "Enter a valid PAN")
      .default(""),
    bankName: optionalText(120),
    bankAccountName: optionalText(120),
    bankAccountNumber: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{6,20}$/.test(v), "Enter digits only")
      .default(""),
    bankIfsc: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "Enter a valid IFSC code")
      .default(""),
    upiId: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(v), "Enter a valid UPI ID")
      .default(""),
    invoicePrefix: z.string().trim().regex(DOCUMENT_PREFIX_PATTERN, "1–5 letters or digits"),
    quotationPrefix: z.string().trim().regex(DOCUMENT_PREFIX_PATTERN, "1–5 letters or digits"),
    defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365),
    defaultQuotationValidityDays: z.coerce.number().int().min(1).max(365),
    quotationTerms: optionalText(5000),
    invoiceTerms: optionalText(5000),
    taxRates: z.array(taxRateInput).max(20),
  })
  .superRefine((v, ctx) => {
    if (v.gstRegistered && !v.gstin) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: "GSTIN is required when GST registered" });
    }
    if (v.gstRegistered && !v.state) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "State is required to work out CGST/SGST vs IGST" });
    }
  });

export type CompanySettingsInput = z.input<typeof companySettingsSchema>;
export type CompanySettingsData = z.output<typeof companySettingsSchema>;
