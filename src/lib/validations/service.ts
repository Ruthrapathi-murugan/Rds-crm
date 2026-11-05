import { z } from "zod";
import { PRICING_UNITS, SERVICE_CATEGORIES } from "@/lib/constants";
import { moneyInput, optionalText, percentInput, requiredText } from "./common";

export const serviceFormSchema = z.object({
  name: requiredText("Service name", 150),
  category: z.enum(SERVICE_CATEGORIES, { error: "Choose a category" }),
  description: optionalText(2000),
  basePrice: moneyInput,
  pricingUnit: z.enum(PRICING_UNITS, { error: "Choose how the service is billed" }),
  sacCode: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, "SAC code must be 4 to 8 digits")
    .optional()
    .transform((v) => v ?? ""),
  /** Percentage string → basis points; "" means "choose on each document". */
  defaultTaxRate: z
    .union([z.literal(""), z.null(), percentInput])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  isActive: z.boolean(),
  sortOrder: z
    .union([z.string().trim(), z.number()])
    .optional()
    .transform((value, ctx) => {
      const n = value === undefined || value === "" ? 0 : Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 1000) {
        ctx.addIssue({ code: "custom", message: "Enter a whole number from 0 to 1000" });
        return z.NEVER;
      }
      return n;
    }),
});
export type ServiceFormInput = z.input<typeof serviceFormSchema>;
export type ServiceFormData = z.output<typeof serviceFormSchema>;

export const serviceActiveSchema = z.object({ isActive: z.boolean() });

/** Basis points → the percentage string used by the form ("18", "2.5", "0"). */
export function taxRateToInput(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  return String(Number((bps / 100).toFixed(2)));
}
