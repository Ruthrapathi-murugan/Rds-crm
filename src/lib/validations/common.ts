/**
 * Reusable Zod building blocks. Schemas are shared by forms (client) and
 * route handlers (server); the server parse is always authoritative.
 *
 * Form conventions: money is entered as rupee strings and transformed to
 * integer paise; dates arrive as "yyyy-MM-dd" (IST calendar day) and
 * date-times as "yyyy-MM-ddTHH:mm" (IST wall-clock time).
 */
import { z } from "zod";
import { GSTIN_PATTERN, PHONE_PATTERN } from "@/lib/constants";
import { parseDateInputIST } from "@/lib/utils/date";
import { rupeesToPaise } from "@/lib/utils/money";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid reference");
export const optionalObjectId = z
  .union([objectId, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((v) => v ?? "");

export const phone = z
  .string()
  .trim()
  .regex(PHONE_PATTERN, "Enter a valid phone number");

export const optionalPhone = z
  .union([phone, z.literal("")])
  .optional()
  .transform((v) => v ?? "");

export const optionalEmail = z
  .union([z.email("Enter a valid email address").trim().toLowerCase().max(200), z.literal("")])
  .optional()
  .transform((v) => v ?? "");

export const optionalGstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || GSTIN_PATTERN.test(v), "Enter a valid 15-character GSTIN")
  .optional()
  .transform((v) => v ?? "");

/** Rupee amount as typed by the user ("12,500.50") → integer paise. Empty → 0. */
export const moneyInput = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === "") return 0;
    try {
      const paise = rupeesToPaise(value);
      if (paise < 0) {
        ctx.addIssue({ code: "custom", message: "Amount cannot be negative" });
        return z.NEVER;
      }
      if (paise > 1_000_000_000_00) {
        ctx.addIssue({ code: "custom", message: "Amount is too large" });
        return z.NEVER;
      }
      return paise;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 12500 or 12500.50" });
      return z.NEVER;
    }
  });

/** Required positive rupee amount → paise. */
export const positiveMoneyInput = moneyInput.refine((v) => v > 0, "Amount must be more than zero");

/** "yyyy-MM-dd" IST calendar date → Date (start of that IST day). */
export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .transform((v) => parseDateInputIST(v));

export const optionalDateInput = z
  .union([dateInput, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v instanceof Date ? v : null));

/** "yyyy-MM-ddTHH:mm" IST wall-clock time → Date. */
export const dateTimeInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time")
  .transform((v, ctx) => {
    const date = new Date(`${v}:00+05:30`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Choose a valid date and time" });
      return z.NEVER;
    }
    return date;
  });

export const optionalDateTimeInput = z
  .union([dateTimeInput, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v instanceof Date ? v : null));

/** Percentage string ("18", "2.5") → basis points. */
export const percentInput = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      const bps = rupeesToPaise(value);
      if (bps < 0 || bps > 10_000) throw new RangeError();
      return bps;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a percentage between 0 and 100" });
      return z.NEVER;
    }
  });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(5).max(100).catch(20),
  q: z.string().trim().max(100).catch(""),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).catch("desc"),
});
