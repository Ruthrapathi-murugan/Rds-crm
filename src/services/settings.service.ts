import "server-only";
import { stateCodeOf } from "@/lib/constants";
import { connectToDatabase } from "@/lib/mongodb";
import type { CompanySettingsData } from "@/lib/validations/settings";
import { CompanySettingsModel, type CompanySettingsDoc } from "@/models/company-settings";
import type { SessionUser } from "@/types";
import { logActivity } from "./activity.service";

export type TaxRateOption = { id: string; label: string; rateBps: number; isActive: boolean };

export type CompanySettings = {
  companyName: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  gstRegistered: boolean;
  gstin: string;
  pan: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  upiId: string;
  invoicePrefix: string;
  quotationPrefix: string;
  defaultPaymentTermsDays: number;
  defaultQuotationValidityDays: number;
  quotationTerms: string;
  invoiceTerms: string;
  taxRates: TaxRateOption[];
};

/** Used until an admin saves settings for the first time. */
export const DEFAULT_SETTINGS = {
  companyName: "Ruthra Digital Solutions",
  city: "Palani",
  state: "Tamil Nadu",
  gstRegistered: false,
  invoicePrefix: "RDS",
  quotationPrefix: "RDSQ",
  defaultPaymentTermsDays: 15,
  defaultQuotationValidityDays: 30,
  quotationTerms:
    "1. This quotation is valid until the date shown above.\n2. 50% advance is required to start the work; the balance is due on completion.\n3. Domain, hosting and third-party charges are billed separately unless listed.",
  invoiceTerms:
    "1. Please pay by the due date shown above.\n2. Mention the invoice number as the payment reference.",
  // Editable starting points only — the business chooses the rates that apply.
  taxRates: [
    { label: "Nil rated (0%)", rateBps: 0, isActive: true },
    { label: "GST 5%", rateBps: 500, isActive: true },
    { label: "GST 18%", rateBps: 1800, isActive: true },
  ],
};

function toSettings(doc: Partial<CompanySettingsDoc> | null): CompanySettings {
  const d = { ...DEFAULT_SETTINGS, ...(doc ?? {}) } as Partial<CompanySettingsDoc> & typeof DEFAULT_SETTINGS;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    companyName: s(d.companyName),
    legalName: s(d.legalName),
    email: s(d.email),
    phone: s(d.phone),
    website: s(d.website),
    addressLine1: s(d.addressLine1),
    addressLine2: s(d.addressLine2),
    city: s(d.city),
    state: s(d.state),
    stateCode: stateCodeOf(s(d.state)) ?? "",
    pincode: s(d.pincode),
    gstRegistered: Boolean(d.gstRegistered),
    gstin: s(d.gstin),
    pan: s(d.pan),
    bankName: s(d.bankName),
    bankAccountName: s(d.bankAccountName),
    bankAccountNumber: s(d.bankAccountNumber),
    bankIfsc: s(d.bankIfsc),
    upiId: s(d.upiId),
    invoicePrefix: s(d.invoicePrefix) || "RDS",
    quotationPrefix: s(d.quotationPrefix) || "RDSQ",
    defaultPaymentTermsDays: Number(d.defaultPaymentTermsDays ?? 15),
    defaultQuotationValidityDays: Number(d.defaultQuotationValidityDays ?? 30),
    quotationTerms: s(d.quotationTerms),
    invoiceTerms: s(d.invoiceTerms),
    taxRates: (d.taxRates ?? []).map((t, i) => ({
      id: "_id" in t && t._id ? String(t._id) : `default-${i}`,
      label: t.label,
      rateBps: t.rateBps,
      isActive: t.isActive !== false,
    })),
  };
}

export async function getCompanySettings(): Promise<CompanySettings> {
  await connectToDatabase();
  return toSettings(await CompanySettingsModel.findOne({ key: "default" }).lean());
}

/** Single-line seller address for documents. */
export function formatSellerAddress(s: CompanySettings): string {
  return [s.addressLine1, s.addressLine2, s.city, s.state && `${s.state}${s.pincode ? ` – ${s.pincode}` : ""}`]
    .filter(Boolean)
    .join(", ");
}

export async function updateCompanySettings(actor: SessionUser, input: CompanySettingsData) {
  await connectToDatabase();
  const before = await getCompanySettings();
  const doc = await CompanySettingsModel.findOneAndUpdate(
    { key: "default" },
    {
      ...input,
      taxRates: input.taxRates.map((t) => ({
        ...(t.id && /^[a-f0-9]{24}$/i.test(t.id) ? { _id: t.id } : {}),
        label: t.label,
        rateBps: t.rate,
        isActive: t.isActive,
      })),
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  const changed: string[] = [];
  if (before.gstRegistered !== input.gstRegistered || before.gstin !== input.gstin) changed.push("GST registration");
  if (before.invoicePrefix !== input.invoicePrefix || before.quotationPrefix !== input.quotationPrefix) {
    changed.push("document numbering");
  }
  if (JSON.stringify(before.taxRates.map((t) => [t.label, t.rateBps, t.isActive])) !==
      JSON.stringify(input.taxRates.map((t) => [t.label, t.rate, t.isActive]))) {
    changed.push("tax rates");
  }
  await logActivity({
    actor,
    action: "settings.updated",
    entityType: "settings",
    message: changed.length ? `Updated company settings (${changed.join(", ")})` : "Updated company settings",
    sensitive: changed.length > 0,
  });
  return toSettings(doc);
}
