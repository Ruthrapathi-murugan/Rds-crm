import "server-only";
import type { ClientSession, Types } from "mongoose";
import { stateCodeOf, type TaxMode } from "@/lib/constants";
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { computeDocument, invoiceTitle, LineCalculationError } from "@/lib/finance/document-calc";
import type { LineItemInput } from "@/lib/validations/finance";
import { formatBasisPoints } from "@/lib/utils/money";
import { CustomerModel } from "@/models/customer";
import { ServiceModel } from "@/models/service";
import type { CompanySettings } from "../settings.service";
import { formatSellerAddress } from "../settings.service";

export type BillTo = {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  gstin: string;
};

export type DocumentLine = {
  serviceId: string | null;
  description: string;
  sacCode: string;
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  taxRateBps: number;
  amountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

export type DocumentTotals = {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
};

/** Parsed line as produced by the finance Zod schemas. */
type ParsedLine = {
  service: string | null;
  description: string;
  sacCode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
};

/** Copies the customer's billing details onto a document at the time it is made. */
export async function buildBillTo(customerId: string, session?: ClientSession): Promise<BillTo & { customerId: Types.ObjectId }> {
  const customer = await CustomerModel.findById(customerId).session(session ?? null).lean();
  if (!customer) throw new NotFoundError("Customer");
  if (customer.archivedAt) throw new ConflictError("This customer is archived. Restore the customer first.");
  return {
    customerId: customer._id,
    name: customer.name,
    businessName: customer.businessName ?? "",
    email: customer.email ?? "",
    phone: customer.phone,
    address: [customer.address, customer.pincode].filter(Boolean).join(" – "),
    city: customer.city ?? "",
    state: customer.state ?? "",
    stateCode: stateCodeOf(customer.state) ?? "",
    gstin: customer.gstin ?? "",
  };
}

/**
 * GST safeguards: GST can only be charged by a registered business, and only
 * at one of the rates configured in Settings.
 */
export function assertTaxTreatment(taxMode: TaxMode, lines: ParsedLine[], settings: CompanySettings) {
  if (taxMode === "none") return;
  if (!settings.gstRegistered || !settings.gstin) {
    throw new BadRequestError(
      "GST can only be charged when the business is GST-registered. Update Settings or choose “No GST”.",
      { taxMode: ["Your business is not set up as GST-registered in Settings"] },
    );
  }
  // Only rates that are currently switched on in Settings may be used.
  const allowed = new Set(settings.taxRates.filter((t) => t.isActive).map((t) => t.rateBps));
  const fieldErrors: Record<string, string[]> = {};
  lines.forEach((line, index) => {
    if (!allowed.has(line.taxRate)) {
      fieldErrors[`items.${index}.taxRate`] = [`${formatBasisPoints(line.taxRate)} is not an active tax rate in Settings`];
    }
  });
  if (Object.keys(fieldErrors).length) throw new ValidationError(fieldErrors, "Choose tax rates from your configured list.");
}

/**
 * Validates the lines and computes every amount on the server. Client-sent
 * totals are never used. Missing SAC codes are filled from the service.
 */
export async function prepareLines(lines: ParsedLine[], taxMode: TaxMode, settings: CompanySettings) {
  assertTaxTreatment(taxMode, lines, settings);

  const serviceIds = [...new Set(lines.map((l) => l.service).filter((id): id is string => Boolean(id)))];
  const services = serviceIds.length ? await ServiceModel.find({ _id: { $in: serviceIds } }).select("sacCode").lean() : [];
  const sacByService = new Map(services.map((s) => [s._id.toString(), s.sacCode ?? ""]));
  const missing = serviceIds.filter((id) => !sacByService.has(id));
  if (missing.length) {
    throw new ValidationError(
      Object.fromEntries(
        lines.flatMap((l, i) => (l.service && missing.includes(l.service) ? [[`items.${i}.service`, ["Service not found"]]] : [])),
      ),
    );
  }

  try {
    const { items, totals } = computeDocument(
      lines.map((l) => ({
        service: l.service,
        description: l.description,
        sacCode: l.sacCode || (l.service ? (sacByService.get(l.service) ?? "") : ""),
        quantity: l.quantity,
        unitPricePaise: l.unitPrice,
        discountPaise: l.discount,
        taxRateBps: l.taxRate,
      })),
      taxMode,
    );
    return {
      items: items.map((item) => ({
        service: item.service ?? undefined,
        description: item.description,
        sacCode: item.sacCode,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        discountPaise: item.discountPaise,
        taxRateBps: item.taxRateBps,
        amountPaise: item.amountPaise,
        taxablePaise: item.taxablePaise,
        cgstPaise: item.cgstPaise,
        sgstPaise: item.sgstPaise,
        igstPaise: item.igstPaise,
        totalPaise: item.totalPaise,
      })),
      totals,
    };
  } catch (error) {
    if (error instanceof LineCalculationError) {
      throw new ValidationError({ [`items.${error.lineIndex}`]: [error.message] });
    }
    if (error instanceof RangeError) {
      throw new ValidationError({ items: ["An amount is too large. Check the quantities and prices."] });
    }
    throw error;
  }
}

export function toDocumentLine(item: {
  service?: Types.ObjectId | null;
  description: string;
  sacCode?: string | null;
  quantity: number;
  unitPricePaise: number;
  discountPaise?: number | null;
  taxRateBps?: number | null;
  amountPaise: number;
  taxablePaise: number;
  cgstPaise?: number | null;
  sgstPaise?: number | null;
  igstPaise?: number | null;
  totalPaise: number;
}): DocumentLine {
  return {
    serviceId: item.service?.toString() ?? null,
    description: item.description,
    sacCode: item.sacCode ?? "",
    quantity: item.quantity,
    unitPricePaise: item.unitPricePaise,
    discountPaise: item.discountPaise ?? 0,
    taxRateBps: item.taxRateBps ?? 0,
    amountPaise: item.amountPaise,
    taxablePaise: item.taxablePaise,
    cgstPaise: item.cgstPaise ?? 0,
    sgstPaise: item.sgstPaise ?? 0,
    igstPaise: item.igstPaise ?? 0,
    totalPaise: item.totalPaise,
  };
}

export function toTotals(t: Partial<DocumentTotals> | null | undefined): DocumentTotals {
  return {
    subtotalPaise: t?.subtotalPaise ?? 0,
    discountPaise: t?.discountPaise ?? 0,
    taxablePaise: t?.taxablePaise ?? 0,
    cgstPaise: t?.cgstPaise ?? 0,
    sgstPaise: t?.sgstPaise ?? 0,
    igstPaise: t?.igstPaise ?? 0,
    taxPaise: t?.taxPaise ?? 0,
    totalPaise: t?.totalPaise ?? 0,
  };
}

export function toBillTo(b: Partial<BillTo> | null | undefined): BillTo {
  return {
    name: b?.name ?? "",
    businessName: b?.businessName ?? "",
    email: b?.email ?? "",
    phone: b?.phone ?? "",
    address: b?.address ?? "",
    city: b?.city ?? "",
    state: b?.state ?? "",
    stateCode: b?.stateCode ?? "",
    gstin: b?.gstin ?? "",
  };
}

/** Seller details frozen onto an invoice when it is issued. */
export function sellerSnapshot(settings: CompanySettings) {
  return {
    name: settings.legalName || settings.companyName,
    address: formatSellerAddress(settings),
    stateName: settings.state,
    stateCode: settings.stateCode,
    gstin: settings.gstRegistered ? settings.gstin : "",
    gstRegistered: settings.gstRegistered,
    email: settings.email,
    phone: settings.phone,
  };
}

export { invoiceTitle };
export type { LineItemInput };
