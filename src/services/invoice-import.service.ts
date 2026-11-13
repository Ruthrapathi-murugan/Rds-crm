import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { CUSTOMER_TYPES, LEAD_SOURCES, TAX_MODES } from "@/lib/constants";
import { computeDocument } from "@/lib/finance/document-calc";
import { documentCounterKey, financialYear, formatDocumentNumber } from "@/lib/finance/numbering";
import { connectToDatabase } from "@/lib/mongodb";
import { formatINR, rupeesToPaise } from "@/lib/utils/money";
import { customerFormSchema } from "@/lib/validations/customer";
import { invoiceFormSchema } from "@/lib/validations/finance";
import { leadFormSchema } from "@/lib/validations/lead";
import { CompanySettingsModel } from "@/models/company-settings";
import { CounterModel } from "@/models/counter";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import type { SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { updateCustomer } from "./customer.service";
import { createInvoice, issueInvoice } from "./invoice.service";
import { convertLead, createLead } from "./lead.service";
import { DEFAULT_SETTINGS, getCompanySettings } from "./settings.service";

/**
 * One-off import of invoices that were made outside the CRM (e.g. old PDFs).
 * Every record goes through the normal services, so GST, totals, numbering
 * and activity logs are exactly what the app itself would produce. Each
 * invoice also gets a lead (marked won) and a customer. Safe to re-run:
 * existing invoice numbers, customers and leads are reused, not duplicated.
 */

const contactSchema = z.object({
  name: z.string().trim().min(1),
  businessName: z.string().trim().optional().default(""),
  phone: z.string().trim().min(1),
  whatsapp: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  pincode: z.string().trim().optional().default(""),
  gstin: z.string().trim().optional().default(""),
  type: z.enum(CUSTOMER_TYPES).default("small_business"),
});

const importInvoiceSchema = z.object({
  /** The number printed on the original invoice, e.g. 1 for "0001". */
  number: z.number().int().min(1).max(9999),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxMode: z.enum(TAX_MODES),
  /** Total printed on the original, checked against the app's own calculation. */
  expectedTotal: z.string().trim().min(1),
  customer: contactSchema,
  lead: z.object({ source: z.enum(LEAD_SOURCES).default("other"), notes: z.string().optional().default("") }).default({ source: "other", notes: "" }),
  items: z
    .array(
      z.object({
        sacCode: z.string().trim().optional().default(""),
        description: z.string().trim().min(1),
        quantity: z.union([z.string(), z.number()]).transform(String),
        unitPrice: z.union([z.string(), z.number()]).transform(String),
        discount: z.union([z.string(), z.number()]).optional().transform((v) => (v === undefined ? "" : String(v))),
        taxRate: z.union([z.string(), z.number()]).transform(String),
      }),
    )
    .min(1),
});

const companySchema = z.object({
  companyName: z.string().trim().min(1),
  email: z.string().trim().optional().default(""),
  website: z.string().trim().optional().default(""),
  addressLine1: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  pincode: z.string().trim().regex(/^\d{6}$/),
  gstin: z.string().trim().toUpperCase().min(15).max(15),
});

export const invoiceImportFileSchema = z.object({
  /** Seller details used only when Settings has no GSTIN or address yet. */
  company: companySchema.optional(),
  invoices: z.array(importInvoiceSchema).min(1),
});
export type InvoiceImportFile = z.input<typeof invoiceImportFileSchema>;

type Report = string[];

const NUMBER_PATTERN = /-(\d+)$/;

/** Moves a simple counter (lead, customer) past any number already stored, e.g. records added by hand. */
async function syncSimpleCounter(kind: "lead" | "customer") {
  const numbers =
    kind === "lead"
      ? (await LeadModel.find({}, { leadNumber: 1 }).lean()).map((d) => d.leadNumber)
      : (await CustomerModel.find({}, { customerNumber: 1 }).lean()).map((d) => d.customerNumber);
  const highest = Math.max(0, ...numbers.map((n) => Number(NUMBER_PATTERN.exec(n ?? "")?.[1] ?? 0)));
  if (highest > 0) await CounterModel.updateOne({ _id: kind }, { $max: { seq: highest } }, { upsert: true });
}

function contactMatch(contact: z.output<typeof contactSchema>) {
  const or: Record<string, string>[] = [{ phone: contact.phone }];
  if (contact.gstin) or.push({ gstin: contact.gstin.toUpperCase() });
  return { $or: or };
}

export async function importInvoices(
  user: SessionUser,
  input: unknown,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<Report> {
  await connectToDatabase();
  const file = invoiceImportFileSchema.parse(input);
  const report: Report = [];
  const log = (line: string) => report.push(line);

  // ── Seller details ────────────────────────────────────────────────────
  let settings = await getCompanySettings();
  if (!settings.gstin || !settings.addressLine1) {
    if (!file.company) throw new Error("Settings has no GSTIN or address yet. Fill in Settings, or add a \"company\" block to the import file.");
    log(`Settings: filling company details (${file.company.addressLine1}, ${file.company.city})`);
    if (!dryRun) {
      const existing = await CompanySettingsModel.findOne({ key: "default" }).lean();
      if (!existing) {
        // Never saved: start from the same defaults the Settings page shows (incl. GST rates).
        await CompanySettingsModel.create({ ...DEFAULT_SETTINGS, ...file.company, key: "default", gstRegistered: true });
      } else {
        await CompanySettingsModel.updateOne(
          { _id: existing._id },
          { $set: { ...file.company, gstRegistered: true, ...(existing.taxRates?.length ? {} : { taxRates: DEFAULT_SETTINGS.taxRates }) } },
        );
      }
      await logActivity({
        actor: user,
        action: "settings.updated",
        entityType: "settings",
        entityLabel: "Company settings",
        message: "Filled company details during invoice import",
        sensitive: true,
      });
      settings = await getCompanySettings();
    }
  } else {
    log(`Settings: using seller address "${[settings.addressLine1, settings.city].filter(Boolean).join(", ")}"`);
  }

  // Validate every invoice and check its total before writing anything.
  const plans = file.invoices
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((inv) => {
      const lines = invoiceFormSchema.shape.items.parse(inv.items);
      const { totals } = computeDocument(
        lines.map((l) => ({
          service: null,
          description: l.description,
          sacCode: l.sacCode,
          quantity: l.quantity,
          unitPricePaise: l.unitPrice,
          discountPaise: l.discount,
          taxRateBps: l.taxRate,
        })),
        inv.taxMode,
      );
      const expected = rupeesToPaise(inv.expectedTotal);
      if (totals.totalPaise !== expected) {
        throw new Error(
          `Invoice ${inv.number}: the app calculates ${formatINR(totals.totalPaise)} but the original says ${formatINR(expected)}. Check the lines.`,
        );
      }
      const date = new Date(`${inv.issueDate}T12:00:00+05:30`);
      const invoiceNumber = formatDocumentNumber(settings.invoicePrefix, financialYear(date), inv.number);
      return { inv, totals, invoiceNumber, counterKey: documentCounterKey("invoice", settings.invoicePrefix, financialYear(date)) };
    });

  if (dryRun) {
    for (const p of plans) log(`Would import ${p.invoiceNumber} — ${p.inv.customer.businessName || p.inv.customer.name} — ${formatINR(p.totals.totalPaise)}`);
    return report;
  }

  await syncSimpleCounter("lead");
  await syncSimpleCounter("customer");
  const counterStart = new Map<string, number>();

  for (const { inv, totals, invoiceNumber, counterKey } of plans) {
    const label = inv.customer.businessName || inv.customer.name;
    const c = inv.customer;
    const customerData = customerFormSchema.parse({ ...c, status: "active", notes: "" });

    // ── Lead (won) and customer ─────────────────────────────────────────
    let customer = await CustomerModel.findOne(contactMatch(c)).lean();
    let lead = await LeadModel.findOne({ phone: c.phone }).lean();
    if (lead && !lead.createdBy) {
      // Added by hand without an owner; the app needs one to open it.
      await LeadModel.updateOne({ _id: lead._id }, { $set: { createdBy: new Types.ObjectId(user.id) } });
    }
    if (!lead) {
      const created = await createLead(
        user,
        leadFormSchema.parse({
          contactName: c.name,
          businessName: c.businessName,
          phone: c.phone,
          whatsapp: c.whatsapp,
          email: c.email,
          location: c.city,
          source: inv.lead.source,
          estimatedValue: (totals.totalPaise / 100).toFixed(2),
          status: "qualified",
          notes: inv.lead.notes,
        }),
      );
      lead = await LeadModel.findById(created.id).lean();
      log(`Lead ${created.leadNumber} created for ${label}`);
    } else {
      log(`Lead ${lead.leadNumber} already exists for ${label}`);
    }
    if (!lead) throw new Error(`Lead for ${label} could not be loaded`);

    if (!customer && lead.convertedCustomer) customer = await CustomerModel.findById(lead.convertedCustomer).lean();
    if (!customer) {
      const { customerId } = await convertLead(user, lead._id.toString(), {
        customerType: c.type,
        createProject: false,
        projectName: "",
        projectService: null,
        quotedAmount: 0,
      });
      await updateCustomer(user, customerId, customerData);
      customer = await CustomerModel.findById(customerId).lean();
      log(`Customer ${customer?.customerNumber} created for ${label} (from the lead)`);
    } else {
      if (!lead.convertedCustomer) {
        await LeadModel.updateOne(
          { _id: lead._id },
          { $set: { status: "won", convertedCustomer: customer._id, convertedAt: new Date() } },
        );
      }
      log(`Customer ${customer.customerNumber} already exists for ${label}`);
    }
    if (!customer) throw new Error(`Customer for ${label} could not be loaded`);

    // ── Invoice ──────────────────────────────────────────────────────────
    if (await InvoiceModel.exists({ invoiceNumber })) {
      log(`Invoice ${invoiceNumber} already exists — skipped`);
      continue;
    }
    const draft = await createInvoice(
      user,
      invoiceFormSchema.parse({
        customer: customer._id.toString(),
        taxMode: inv.taxMode,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        items: inv.items,
        terms: settings.invoiceTerms,
        notes: "",
      }),
    );
    // Issue it under its original number: point the year's counter just before it.
    if (!counterStart.has(counterKey)) {
      const current = await CounterModel.findById(counterKey).lean();
      counterStart.set(counterKey, current?.seq ?? 0);
    }
    await CounterModel.updateOne({ _id: counterKey }, { $set: { seq: inv.number - 1 } }, { upsert: true });
    const issued = await issueInvoice(user, draft.id);
    if (issued.invoiceNumber !== invoiceNumber) throw new Error(`Expected ${invoiceNumber} but got ${issued.invoiceNumber}`);
    log(`Invoice ${issued.invoiceNumber} issued — ${label} — ${formatINR(totals.totalPaise)}`);
  }

  // New invoices continue after the highest number in each year (gaps are kept free).
  for (const [key, start] of counterStart) {
    const numbers = plans.filter((p) => p.counterKey === key).map((p) => p.inv.number);
    await CounterModel.updateOne({ _id: key }, { $set: { seq: Math.max(start, ...numbers) } });
  }
  return report;
}
