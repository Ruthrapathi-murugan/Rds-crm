import type { CompanySettingsInput } from "@/lib/validations/settings";
import type { CompanySettings } from "@/services/settings.service";

/** Basis points → percentage text for the form, e.g. 1800 → "18", 250 → "2.5", 0 → "0". */
export function basisPointsToPercentInput(bps: number): string {
  return String(Number((bps / 100).toFixed(2)));
}

/** Saved settings → raw form strings (the schema converts them back on submit). */
export function settingsToFormValues(s: CompanySettings): CompanySettingsInput {
  return {
    companyName: s.companyName,
    legalName: s.legalName,
    email: s.email,
    phone: s.phone,
    website: s.website,
    addressLine1: s.addressLine1,
    addressLine2: s.addressLine2,
    city: s.city,
    state: s.state,
    pincode: s.pincode,
    gstRegistered: s.gstRegistered,
    gstin: s.gstin,
    pan: s.pan,
    bankName: s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNumber: s.bankAccountNumber,
    bankIfsc: s.bankIfsc,
    upiId: s.upiId,
    invoicePrefix: s.invoicePrefix,
    quotationPrefix: s.quotationPrefix,
    defaultPaymentTermsDays: String(s.defaultPaymentTermsDays),
    defaultQuotationValidityDays: String(s.defaultQuotationValidityDays),
    quotationTerms: s.quotationTerms,
    invoiceTerms: s.invoiceTerms,
    taxRates: s.taxRates.map((t) => ({
      // Placeholder ids for unsaved defaults are not sent back as record ids.
      id: /^[a-f0-9]{24}$/i.test(t.id) ? t.id : undefined,
      label: t.label,
      rate: basisPointsToPercentInput(t.rateBps),
      isActive: t.isActive,
    })),
  };
}
