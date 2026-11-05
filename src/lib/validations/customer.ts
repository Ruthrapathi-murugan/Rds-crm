import { z } from "zod";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, INDIAN_STATE_NAMES } from "@/lib/constants";
import {
  objectId,
  optionalEmail,
  optionalGstin,
  optionalPhone,
  optionalText,
  phone,
  requiredText,
} from "./common";

const stateNames: readonly string[] = INDIAN_STATE_NAMES;

export const customerFormSchema = z.object({
  name: requiredText("Contact name", 120),
  businessName: optionalText(200),
  phone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  address: optionalText(500),
  city: optionalText(100),
  state: z
    .string()
    .trim()
    .refine((v) => v === "" || stateNames.includes(v), "Choose a state from the list")
    .optional()
    .transform((v) => v ?? ""),
  pincode: z
    .string()
    .trim()
    .regex(/^(\d{6})?$/, "Enter a 6-digit PIN code")
    .optional()
    .transform((v) => v ?? ""),
  gstin: optionalGstin,
  type: z.enum(CUSTOMER_TYPES, { error: "Choose a customer type" }),
  status: z.enum(CUSTOMER_STATUSES),
  servicesPurchased: z
    .array(objectId)
    .max(50, "Choose at most 50 services")
    .optional()
    .transform((v) => [...new Set((v ?? []).map((id) => id.toLowerCase()))]),
  notes: optionalText(5000),
});
export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormData = z.output<typeof customerFormSchema>;
