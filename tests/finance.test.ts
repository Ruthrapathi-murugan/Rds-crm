import { beforeEach, describe, expect, it } from "vitest";
import { BadRequestError, ConflictError, ValidationError } from "@/lib/errors";
import { invoiceFormSchema, paymentFormSchema, quotationFormSchema } from "@/lib/validations/finance";
import { CompanySettingsModel } from "@/models/company-settings";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import {
  cancelInvoice,
  createInvoice,
  deleteDraftInvoice,
  getInvoice,
  invoiceSummary,
  issueInvoice,
  listInvoices,
  updateInvoice,
} from "@/services/invoice.service";
import { getPayment, recordPayment, voidPayment } from "@/services/payment.service";
import { convertQuotationToInvoice, createQuotation, getQuotation, setQuotationStatus } from "@/services/quotation.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

async function setupCompany({ gstRegistered = true } = {}) {
  await CompanySettingsModel.create({
    key: "default",
    companyName: "Ruthra Digital Solutions",
    state: "Tamil Nadu",
    gstRegistered,
    gstin: gstRegistered ? "33ABCDE1234F1Z5" : "",
    invoicePrefix: "RDS",
    quotationPrefix: "RDSQ",
    defaultPaymentTermsDays: 15,
    taxRates: [
      { label: "Nil", rateBps: 0 },
      { label: "GST 5%", rateBps: 500 },
      { label: "GST 18%", rateBps: 1800 },
    ],
  });
}

let seq = 0;
async function createCustomer(state = "Tamil Nadu") {
  seq += 1;
  const admin = await createTestUser("admin");
  return CustomerModel.create({
    customerNumber: `CU-T${seq}`,
    name: `Customer ${seq}`,
    businessName: `Business ${seq}`,
    phone: "9876543210",
    state,
    gstin: "33AAAAA0000A1Z5",
    createdBy: admin.id,
  });
}

const line = (overrides: Record<string, unknown> = {}) => ({
  description: "Hotel website design and development",
  quantity: "1",
  unitPrice: "50000",
  discount: "",
  taxRate: "18",
  ...overrides,
});

function invoiceInput(customer: string, overrides: Record<string, unknown> = {}) {
  return invoiceFormSchema.parse({
    customer,
    taxMode: "intra_state",
    issueDate: "2026-10-23",
    dueDate: "2026-11-07",
    items: [line()],
    ...overrides,
  });
}

function payment(overrides: Record<string, unknown> = {}) {
  return paymentFormSchema.parse({
    paidAt: "2026-10-23",
    amount: "1000",
    method: "upi",
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  });
}

async function issuedInvoice(total = "50000") {
  const admin = await createTestUser("admin");
  const customer = await createCustomer();
  const { id } = await createInvoice(admin, invoiceInput(customer.id, { taxMode: "none", items: [line({ unitPrice: total, taxRate: "" })] }));
  const issued = await issueInvoice(admin, id);
  return { admin, customer, id, invoiceNumber: issued.invoiceNumber };
}

describe("quotations", () => {
  it("numbers per financial year and computes totals on the server", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const data = quotationFormSchema.parse({
      customer: customer.id,
      taxMode: "intra_state",
      issueDate: "2026-10-23",
      validUntil: "2026-11-22",
      items: [line(), line({ description: "Hosting", unitPrice: "6000", quantity: "2", discount: "1000" })],
      totals: { totalPaise: 1 }, // ignored: not part of the schema
    });
    const { id, quotationNumber } = await createQuotation(admin, data);
    expect(quotationNumber).toBe("RDSQ/26-27/0001");
    const q = await getQuotation(admin, id);
    // 50,000 + 12,000 − 1,000 = 61,000 taxable; 18% GST = 10,980
    expect(q?.totals).toMatchObject({ subtotalPaise: 6_200_000, discountPaise: 100_000, taxablePaise: 6_100_000, cgstPaise: 549_000, sgstPaise: 549_000, totalPaise: 7_198_000 });
    expect(q?.billTo.businessName).toBe(customer.businessName);
  });

  it("refuses GST when the business is not registered, and unconfigured rates", async () => {
    await setupCompany({ gstRegistered: false });
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const base = { customer: customer.id, issueDate: "2026-10-23", validUntil: "2026-11-22" };
    await expect(createQuotation(admin, quotationFormSchema.parse({ ...base, taxMode: "intra_state", items: [line()] }))).rejects.toThrow(
      BadRequestError,
    );
    await CompanySettingsModel.updateOne({}, { gstRegistered: true, gstin: "33ABCDE1234F1Z5" });
    await expect(
      createQuotation(admin, quotationFormSchema.parse({ ...base, taxMode: "intra_state", items: [line({ taxRate: "12" })] })),
    ).rejects.toThrow(ValidationError);
  });

  it("converts once into a draft invoice, even under concurrent clicks", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const { id } = await createQuotation(
      admin,
      quotationFormSchema.parse({ customer: customer.id, taxMode: "intra_state", issueDate: "2026-10-23", validUntil: "2026-11-22", items: [line()] }),
    );
    await expect(convertQuotationToInvoice(admin, id)).rejects.toThrow(ConflictError); // still a draft
    await setQuotationStatus(admin, id, "sent");
    const results = await Promise.allSettled([1, 2, 3].map(() => convertQuotationToInvoice(admin, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await InvoiceModel.countDocuments()).toBe(1);
    const invoice = await InvoiceModel.findOne().lean();
    expect(invoice?.status).toBe("draft");
    expect(invoice?.invoiceNumber).toBeUndefined();
    expect((await getQuotation(admin, id))?.status).toBe("converted");
  });
});

describe("invoices", () => {
  it("assigns gap-free numbers only when issued", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const a = await createInvoice(admin, invoiceInput(customer.id));
    const b = await createInvoice(admin, invoiceInput(customer.id));
    const c = await createInvoice(admin, invoiceInput(customer.id));
    await deleteDraftInvoice(admin, b.id);
    expect((await issueInvoice(admin, c.id)).invoiceNumber).toBe("RDS/26-27/0001");
    expect((await issueInvoice(admin, a.id)).invoiceNumber).toBe("RDS/26-27/0002");
    await expect(issueInvoice(admin, a.id)).rejects.toThrow(ConflictError);
  });

  it("restarts numbering in a new financial year", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const march = await createInvoice(admin, invoiceInput(customer.id, { issueDate: "2026-03-31", dueDate: "2026-04-15" }));
    const april = await createInvoice(admin, invoiceInput(customer.id, { issueDate: "2026-04-01", dueDate: "2026-04-15" }));
    expect((await issueInvoice(admin, march.id)).invoiceNumber).toBe("RDS/25-26/0001");
    expect((await issueInvoice(admin, april.id)).invoiceNumber).toBe("RDS/26-27/0001");
  });

  it("titles GST invoices correctly and uses IGST across states", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const kerala = await createCustomer("Kerala");
    const { id } = await createInvoice(admin, invoiceInput(kerala.id, { taxMode: "inter_state" }));
    await issueInvoice(admin, id);
    const invoice = await getInvoice(admin, id);
    expect(invoice?.title).toBe("Tax Invoice");
    expect(invoice?.totals).toMatchObject({ igstPaise: 900_000, cgstPaise: 0, totalPaise: 5_900_000 });
    expect(invoice?.seller?.gstin).toBe("33ABCDE1234F1Z5");
    expect(invoice?.placeOfSupply).toBe("Kerala");
  });

  it("locks issued invoices and only cancels them without payments", async () => {
    await setupCompany();
    const { admin, customer, id } = await issuedInvoice();
    await expect(updateInvoice(admin, id, invoiceInput(customer.id))).rejects.toThrow(ConflictError);
    await expect(deleteDraftInvoice(admin, id)).rejects.toThrow(ConflictError);
    const paid = await recordPayment(admin, payment({ invoice: id }));
    await expect(cancelInvoice(admin, id, "Raised in error")).rejects.toThrow(ConflictError);
    await voidPayment(admin, paid.id, "Entered twice");
    await cancelInvoice(admin, id, "Raised in error");
    expect((await getInvoice(admin, id))?.status).toBe("cancelled");
    await expect(recordPayment(admin, payment({ invoice: id }))).rejects.toThrow(ConflictError);
  });

  it("derives overdue status and summary figures", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const { id } = await createInvoice(admin, invoiceInput(customer.id, { taxMode: "none", issueDate: "2026-01-01", dueDate: "2026-01-10", items: [line({ taxRate: "" })] }));
    await issueInvoice(admin, id);
    await recordPayment(admin, payment({ invoice: id, amount: "20000" }));
    expect((await getInvoice(admin, id))?.status).toBe("overdue");
    const params = { page: 1, pageSize: 20, q: "", sort: "issueDate" as const, dir: "desc" as const };
    expect((await listInvoices(admin, params, { status: "overdue" })).total).toBe(1);
    expect((await listInvoices(admin, params, { status: "partially_paid" })).total).toBe(0);
    const summary = await invoiceSummary();
    expect(summary).toMatchObject({ invoiced: 5_000_000, outstanding: 3_000_000, overdue: 3_000_000, overdueCount: 1 });
  });
});

describe("payments", () => {
  it("moves an invoice through partially paid to paid", async () => {
    await setupCompany();
    const { admin, id } = await issuedInvoice("50000");
    await recordPayment(admin, payment({ invoice: id, amount: "20000" }));
    expect((await getInvoice(admin, id))).toMatchObject({ storedStatus: "partially_paid", amountPaidPaise: 2_000_000, balancePaise: 3_000_000 });
    await recordPayment(admin, payment({ invoice: id, amount: "30000", method: "bank_transfer", transactionReference: "UTR123" }));
    const invoice = await getInvoice(admin, id);
    expect(invoice).toMatchObject({ storedStatus: "paid", balancePaise: 0 });
    expect(invoice?.paidAt).not.toBeNull();
    expect(invoice?.payments).toHaveLength(2);
  });

  it("rejects overpayment and payments on drafts", async () => {
    await setupCompany();
    const { admin, customer, id } = await issuedInvoice("50000");
    await expect(recordPayment(admin, payment({ invoice: id, amount: "50000.01" }))).rejects.toThrow(BadRequestError);
    const draft = await createInvoice(admin, invoiceInput(customer.id));
    await expect(recordPayment(admin, payment({ invoice: draft.id }))).rejects.toThrow(ConflictError);
  });

  it("is idempotent for the same submission and blocks duplicate references", async () => {
    await setupCompany();
    const { admin, id } = await issuedInvoice("50000");
    const key = crypto.randomUUID();
    const first = await recordPayment(admin, payment({ invoice: id, idempotencyKey: key }));
    const again = await recordPayment(admin, payment({ invoice: id, idempotencyKey: key }));
    expect(again).toMatchObject({ id: first.id, duplicate: true });
    await recordPayment(admin, payment({ invoice: id, transactionReference: "UPI-777" }));
    await expect(recordPayment(admin, payment({ invoice: id, transactionReference: "UPI-777" }))).rejects.toThrow(ConflictError);
    expect(await PaymentModel.countDocuments()).toBe(2);
  });

  it("never lets concurrent payments exceed the balance", async () => {
    await setupCompany();
    const { admin, id } = await issuedInvoice("50000");
    const results = await Promise.allSettled([1, 2, 3].map(() => recordPayment(admin, payment({ invoice: id, amount: "30000" }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const invoice = await getInvoice(admin, id);
    expect(invoice?.amountPaidPaise).toBe(3_000_000);
    expect(invoice?.balancePaise).toBe(2_000_000);
  });

  it("takes the customer from the invoice, not the request", async () => {
    await setupCompany();
    const { admin, customer, id } = await issuedInvoice("50000");
    const other = await createCustomer();
    const { id: paymentId } = await recordPayment(admin, payment({ invoice: id, customer: other.id }));
    expect((await PaymentModel.findById(paymentId).lean())?.customer.toString()).toBe(customer.id);
  });

  it("voids payments, restoring the balance and keeping the record", async () => {
    await setupCompany();
    const { admin, id } = await issuedInvoice("50000");
    const full = await recordPayment(admin, payment({ invoice: id, amount: "50000" }));
    expect((await getInvoice(admin, id))?.storedStatus).toBe("paid");
    await voidPayment(admin, full.id, "Cheque bounced");
    expect(await getInvoice(admin, id)).toMatchObject({ storedStatus: "sent", balancePaise: 5_000_000, paidAt: null });
    expect((await getPayment(admin, full.id))?.status).toBe("voided");
    await expect(voidPayment(admin, full.id, "again")).rejects.toThrow(ConflictError);
  });

  it("records advance payments against a customer without an invoice", async () => {
    await setupCompany();
    const admin = await createTestUser("admin");
    const customer = await createCustomer();
    const { id } = await recordPayment(admin, payment({ customer: customer.id, amount: "10000", method: "cash" }));
    expect((await getPayment(admin, id))).toMatchObject({ invoiceId: null, customerId: customer.id, amountPaise: 1_000_000 });
    await expect(recordPayment(admin, payment({}))).rejects.toThrow(BadRequestError);
  });

  it("rejects future payment dates", async () => {
    await setupCompany();
    const { admin, id } = await issuedInvoice("50000");
    await expect(recordPayment(admin, payment({ invoice: id, paidAt: "2099-01-01" }))).rejects.toThrow(BadRequestError);
  });
});
