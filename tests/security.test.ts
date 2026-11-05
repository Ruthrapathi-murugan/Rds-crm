import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, RateLimitError, ValidationError } from "@/lib/errors";
import { clientIpFrom } from "@/lib/request";
import { invoiceFormSchema, quotationFormSchema } from "@/lib/validations/finance";
import { CompanySettingsModel } from "@/models/company-settings";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { login } from "@/services/auth.service";
import { createInvoice, getInvoice, issueInvoice, updateInvoice } from "@/services/invoice.service";
import { createQuotation, getQuotation, listQuotations } from "@/services/quotation.service";
import { createTestUser, requestMeta, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

async function setup() {
  await CompanySettingsModel.create({
    key: "default",
    companyName: "Ruthra Digital Solutions",
    state: "Tamil Nadu",
    gstRegistered: true,
    gstin: "33ABCDE1234F1Z5",
    taxRates: [
      { label: "GST 18%", rateBps: 1800, isActive: true },
      { label: "GST 12% (retired)", rateBps: 1200, isActive: false },
    ],
  });
  const admin = await createTestUser("admin");
  const customer = await CustomerModel.create({
    customerNumber: "CU-S1",
    name: "Security Test",
    phone: "9876543210",
    state: "Tamil Nadu",
    createdBy: admin.id,
  });
  return { admin, customerId: customer.id as string };
}

const invoiceInput = (customer: string, unitPrice = "1000", taxRate = "18") =>
  invoiceFormSchema.parse({
    customer,
    taxMode: "intra_state",
    issueDate: "2026-10-20",
    dueDate: "2026-11-04",
    items: [{ description: "Website", quantity: "1", unitPrice, taxRate }],
  });

describe("issued invoices stay immutable", () => {
  it("rejects edits that race with issuing", async () => {
    const { admin, customerId } = await setup();
    const { id } = await createInvoice(admin, invoiceInput(customerId));
    const results = await Promise.allSettled([
      issueInvoice(admin, id),
      ...Array.from({ length: 6 }, (_, i) => updateInvoice(admin, id, invoiceInput(customerId, String(i + 1)))),
    ]);
    const invoice = await getInvoice(admin, id);
    expect(results[0].status).toBe("fulfilled");
    expect(invoice?.storedStatus).toBe("sent");
    // Whatever edits landed before issuing, the issued invoice matches what was issued:
    // its total equals its balance and no edit after issuing changed it.
    const raw = await InvoiceModel.findById(id).lean();
    expect(raw?.balancePaise).toBe(raw?.totals?.totalPaise);
    await expect(updateInvoice(admin, id, invoiceInput(customerId, "1"))).rejects.toThrow(ConflictError);
  });

  it("refuses future-dated issuing", async () => {
    const { admin, customerId } = await setup();
    const { id } = await createInvoice(
      admin,
      invoiceFormSchema.parse({ ...invoiceInput(customerId), issueDate: "2099-01-01", dueDate: "2099-01-15", items: [{ description: "x", quantity: "1", unitPrice: "100", taxRate: "18" }] }),
    );
    await expect(issueInvoice(admin, id)).rejects.toThrow(/future/);
  });
});

describe("tax rates", () => {
  it("rejects rates that are switched off in Settings", async () => {
    const { admin, customerId } = await setup();
    await expect(createInvoice(admin, invoiceInput(customerId, "1000", "12"))).rejects.toThrow(ValidationError);
  });

  it("returns a validation error instead of crashing on absurd amounts", async () => {
    const { admin, customerId } = await setup();
    const huge = invoiceFormSchema.parse({
      customer: customerId,
      taxMode: "intra_state",
      issueDate: "2026-10-20",
      dueDate: "2026-11-04",
      items: [{ description: "x", quantity: "100000", unitPrice: "1000000000", taxRate: "18" }],
    });
    await expect(createInvoice(admin, huge)).rejects.toThrow(ValidationError);
  });
});

describe("quotation visibility", () => {
  it("limits staff to quotations they created", async () => {
    const { admin, customerId } = await setup();
    const manager = await createTestUser("manager");
    const staff = await createTestUser("staff");
    const { id } = await createQuotation(
      admin,
      quotationFormSchema.parse({
        customer: customerId,
        taxMode: "none",
        issueDate: "2026-10-20",
        validUntil: "2026-11-20",
        items: [{ description: "Proposal", quantity: "1", unitPrice: "5000" }],
      }),
    );
    const params = { page: 1, pageSize: 20, q: "", sort: "issueDate" as const, dir: "desc" as const };
    expect((await listQuotations(staff, params)).total).toBe(0);
    expect(await getQuotation(staff, id)).toBeNull();
    expect((await listQuotations(manager, params)).total).toBe(1);
    expect(await getQuotation(manager, id)).not.toBeNull();
  });
});

describe("login protection", () => {
  it("caps attempts per account across many IPs", async () => {
    const user = await createTestUser("staff");
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) {
      try {
        await login({ email: user.email, password: "wrong-pass-1" }, { ...requestMeta, ipAddress: `10.0.0.${i}` });
      } catch (error) {
        if (error instanceof RateLimitError) limited = true;
      }
    }
    expect(limited).toBe(true);
  });

  it("does not trust a client-supplied X-Forwarded-For prefix", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFrom(new Headers({ "x-vercel-forwarded-for": "192.0.2.5", "x-forwarded-for": "1.2.3.4" }))).toBe("192.0.2.5");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
