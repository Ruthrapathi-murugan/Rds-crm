import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoredInvoiceStatus } from "@/lib/constants";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { customerFormSchema } from "@/lib/validations/customer";
import { communicationFormSchema } from "@/lib/validations/lead";
import { ActivityLogModel } from "@/models/activity-log";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { ProjectModel } from "@/models/project";
import { ServiceModel } from "@/models/service";
import {
  addCustomerCommunication,
  createCustomer,
  customerFinancialSummary,
  customerOptions,
  getCustomer,
  getCustomerBillingSnapshot,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from "@/services/customer.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

const params = { page: 1, pageSize: 20, q: "", sort: "createdAt" as const, dir: "desc" as const };

function customerInput(overrides: Record<string, unknown> = {}) {
  return customerFormSchema.parse({
    name: "Priya Raman",
    businessName: "Hotel Sri Murugan",
    phone: "98765 43210",
    email: "PRIYA@example.com",
    address: "12 Adivaram Road",
    city: "Palani",
    state: "Tamil Nadu",
    pincode: "624601",
    gstin: "33abcde1234f1z5",
    type: "hotel",
    status: "active",
    ...overrides,
  });
}

const totals = (totalPaise: number) => ({ subtotalPaise: totalPaise, taxablePaise: totalPaise, totalPaise });

async function insertInvoice(customer: string, createdBy: string, status: StoredInvoiceStatus, totalPaise: number, balancePaise: number) {
  return InvoiceModel.create({
    invoiceNumber: status === "draft" ? undefined : `RDS/2026-27/${Math.floor(Math.random() * 1e6)}`,
    customer,
    billTo: { name: "Priya Raman" },
    issueDate: new Date("2026-10-01T00:00:00Z"),
    dueDate: new Date("2026-10-15T00:00:00Z"),
    items: [
      { description: "Website", quantity: 1, unitPricePaise: totalPaise, amountPaise: totalPaise, taxablePaise: totalPaise, totalPaise },
    ],
    totals: totals(totalPaise),
    amountPaidPaise: totalPaise - balancePaise,
    balancePaise,
    status,
    createdBy,
  });
}

let paymentCounter = 0;
async function insertPayment(customer: string, createdBy: string, amountPaise: number, status: "recorded" | "voided") {
  paymentCounter += 1;
  return PaymentModel.create({
    paymentNumber: `PAY-T${paymentCounter}`,
    customer,
    paidAt: new Date("2026-10-05T00:00:00Z"),
    amountPaise,
    method: "upi",
    status,
    createdBy,
  });
}

describe("customer validation", () => {
  it("normalises email, GSTIN and services", () => {
    const id = new Types.ObjectId().toString();
    const data = customerInput({ servicesPurchased: [id, id.toUpperCase()] });
    expect(data.email).toBe("priya@example.com");
    expect(data.gstin).toBe("33ABCDE1234F1Z5");
    expect(data.servicesPurchased).toEqual([id]);
  });

  it("rejects invalid GSTIN, PIN code and state", () => {
    expect(customerFormSchema.safeParse({ ...customerInput(), gstin: "33ABCDE1234F1Z" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...customerInput(), gstin: "XXABCDE1234F1Z5" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...customerInput(), pincode: "6246" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...customerInput(), state: "Atlantis" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...customerInput(), gstin: "", state: "", pincode: "" }).success).toBe(true);
  });

  it("requires name, a valid phone and a known type, and strips unknown keys", () => {
    expect(customerFormSchema.safeParse({ ...customerInput(), name: " " }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...customerInput(), phone: "12" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...customerInput(), type: "alien" }).success).toBe(false);
    const parsed = customerFormSchema.parse({ ...customerInput(), customerNumber: "CU-99999", archivedAt: "x" });
    expect(parsed).not.toHaveProperty("customerNumber");
    expect(parsed).not.toHaveProperty("archivedAt");
  });

  it("limits services purchased to 50", () => {
    const ids = Array.from({ length: 51 }, () => new Types.ObjectId().toString());
    expect(customerFormSchema.safeParse({ ...customerInput(), servicesPurchased: ids }).success).toBe(false);
  });
});

describe("customer lifecycle", () => {
  it("numbers customers sequentially and logs creation", async () => {
    const admin = await createTestUser("admin");
    const a = await createCustomer(admin, customerInput());
    const b = await createCustomer(admin, customerInput({ name: "Karthik" }));
    expect(a.customerNumber).toBe("CU-00001");
    expect(b.customerNumber).toBe("CU-00002");
    expect(await ActivityLogModel.countDocuments({ action: "customer.created" })).toBe(2);
  });

  it("validates that purchased services exist", async () => {
    const admin = await createTestUser("admin");
    await expect(
      createCustomer(admin, customerInput({ servicesPurchased: [new Types.ObjectId().toString()] })),
    ).rejects.toThrow(BadRequestError);
    const service = await ServiceModel.create({ name: "SEO", slug: "seo", category: "digital_marketing" });
    const { id } = await createCustomer(admin, customerInput({ servicesPurchased: [service._id.toString()] }));
    const detail = await getCustomer(admin, id);
    expect(detail?.services).toEqual([{ id: service._id.toString(), name: "SEO" }]);
    expect(detail?.servicesCount).toBe(1);
  });

  it("updates details and logs status changes", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    await updateCustomer(admin, id, customerInput({ status: "inactive", city: "Madurai" }));
    const doc = await CustomerModel.findById(id).lean();
    expect(doc).toMatchObject({ status: "inactive", city: "Madurai" });
    const log = await ActivityLogModel.findOne({ action: "customer.updated" }).lean();
    expect(log?.message).toContain("from Active to Inactive");
  });

  it("searches across fields and filters by type and status", async () => {
    const admin = await createTestUser("admin");
    await createCustomer(admin, customerInput());
    await createCustomer(admin, customerInput({ name: "Karthik", businessName: "Palani Textiles", type: "retail_shop", city: "Dindigul", status: "inactive" }));
    expect((await listCustomers(admin, { ...params, q: "textiles" })).rows[0]?.name).toBe("Karthik");
    expect((await listCustomers(admin, { ...params, q: "dindigul" })).total).toBe(1);
    expect((await listCustomers(admin, { ...params, q: "CU-00001" })).rows[0]?.name).toBe("Priya Raman");
    expect((await listCustomers(admin, { ...params, q: "43210" })).total).toBe(2);
    expect((await listCustomers(admin, params, { type: "hotel" })).total).toBe(1);
    expect((await listCustomers(admin, params, { status: "inactive" })).total).toBe(1);
    expect((await listCustomers(admin, { ...params, q: ".*" })).total).toBe(0);
    const sorted = await listCustomers(admin, { ...params, sort: "name", dir: "asc" });
    expect(sorted.rows.map((r) => r.name)).toEqual(["Karthik", "Priya Raman"]);
  });

  it("lets staff see every customer (no ownership scoping)", async () => {
    const admin = await createTestUser("admin");
    const staff = await createTestUser("staff");
    const { id } = await createCustomer(admin, customerInput());
    expect((await listCustomers(staff, params)).total).toBe(1);
    const detail = await getCustomer(staff, id);
    expect(detail?.name).toBe("Priya Raman");
    // Staff cannot read invoices or payments, so money is withheld.
    expect(detail?.financials).toBeNull();
    expect(detail?.invoices).toBeNull();
    expect(detail?.payments).toBeNull();
  });

  it("archives without touching related records and hides from lists and options", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    await ProjectModel.create({ projectNumber: "PRJ-1", name: "Website", customer: id, category: "web_development", createdBy: admin.id });
    await insertInvoice(id, admin.id, "sent", 10_000_00, 10_000_00);

    await setCustomerArchived(admin, id, true);
    expect((await listCustomers(admin, params)).total).toBe(0);
    expect((await listCustomers(admin, params, { archived: true })).total).toBe(1);
    expect(await customerOptions("")).toHaveLength(0);
    expect(await ProjectModel.countDocuments({ customer: id })).toBe(1);
    expect(await InvoiceModel.countDocuments({ customer: id })).toBe(1);
    expect((await getCustomer(admin, id))?.archived).toBe(true);

    await setCustomerArchived(admin, id, false);
    expect((await listCustomers(admin, params)).total).toBe(1);
    expect(await ActivityLogModel.countDocuments({ action: { $in: ["customer.archived", "customer.restored"] } })).toBe(2);
  });

  it("returns null or not-found for unknown ids", async () => {
    const admin = await createTestUser("admin");
    expect(await getCustomer(admin, "not-an-id")).toBeNull();
    expect(await getCustomer(admin, new Types.ObjectId().toString())).toBeNull();
    await expect(setCustomerArchived(admin, new Types.ObjectId().toString(), true)).rejects.toThrow(NotFoundError);
  });
});

describe("customer options", () => {
  it("labels by business name and searches", async () => {
    const admin = await createTestUser("admin");
    await createCustomer(admin, customerInput());
    await createCustomer(admin, customerInput({ name: "Anand", businessName: "", city: "Kodaikanal" }));
    const all = await customerOptions("");
    expect(all).toHaveLength(2);
    const hotel = all.find((o) => o.label === "Hotel Sri Murugan");
    expect(hotel?.description).toBe("CU-00001 · Priya Raman · Palani");
    expect((await customerOptions("kodai"))[0]?.label).toBe("Anand");
  });
});

describe("communications", () => {
  it("logs interactions newest first and ignores follow-up dates", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    const first = communicationFormSchema.parse({ type: "call", summary: "Kick-off call", occurredAt: "2026-10-01T10:00", nextFollowUpAt: "2026-11-01T10:00" });
    const second = communicationFormSchema.parse({ type: "whatsapp", summary: "Shared logo files", occurredAt: "2026-10-03T09:30" });
    await addCustomerCommunication(admin, id, first);
    await addCustomerCommunication(admin, id, second);
    const detail = await getCustomer(admin, id);
    expect(detail?.communications.map((c) => c.summary)).toEqual(["Shared logo files", "Kick-off call"]);
    expect(detail?.communications[0]?.createdByName).toBe(admin.name);
    expect(await CustomerModel.findById(id).lean()).not.toHaveProperty("nextFollowUpAt");
    expect(await ActivityLogModel.countDocuments({ action: "customer.communication_added" })).toBe(2);
  });
});

describe("financial summary", () => {
  it("counts issued invoices, recorded payments and open balances only", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    const other = await createCustomer(admin, customerInput({ name: "Someone else" }));

    await insertInvoice(id, admin.id, "draft", 5_000_00, 5_000_00); // ignored
    await insertInvoice(id, admin.id, "sent", 10_000_00, 10_000_00);
    await insertInvoice(id, admin.id, "partially_paid", 20_000_00, 7_500_50);
    await insertInvoice(id, admin.id, "paid", 30_000_00, 0);
    await insertInvoice(id, admin.id, "cancelled", 40_000_00, 40_000_00); // ignored
    await insertInvoice(other.id, admin.id, "sent", 99_000_00, 99_000_00); // other customer

    await insertPayment(id, admin.id, 12_499_50, "recorded");
    await insertPayment(id, admin.id, 30_000_00, "recorded");
    await insertPayment(id, admin.id, 1_000_00, "voided"); // ignored
    await insertPayment(other.id, admin.id, 5_00, "recorded");

    expect(await customerFinancialSummary(id)).toEqual({
      invoicedPaise: 60_000_00,
      receivedPaise: 42_499_50,
      outstandingPaise: 17_500_50,
    });

    const detail = await getCustomer(admin, id);
    expect(detail?.financials?.outstandingPaise).toBe(17_500_50);
    expect(detail?.invoices).toHaveLength(5);
    expect(detail?.invoices?.find((i) => i.totalPaise === 5_000_00)?.invoiceNumber).toBe("Draft");
    // Effective status depends on the real clock relative to the 15 Oct 2026 due date.
    const sent = detail?.invoices?.find((i) => i.totalPaise === 10_000_00);
    expect(["sent", "overdue"]).toContain(sent?.status);
    expect(detail?.payments?.map((p) => p.status).sort()).toEqual(["recorded", "recorded", "voided"]);
  });

  it("is zero for a new customer", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    expect(await customerFinancialSummary(id)).toEqual({ invoicedPaise: 0, receivedPaise: 0, outstandingPaise: 0 });
  });

  it("derives overdue status from the due date", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    const inv = await insertInvoice(id, admin.id, "sent", 1_000_00, 1_000_00);
    await InvoiceModel.updateOne({ _id: inv._id }, { dueDate: new Date("2020-01-01T00:00:00Z") });
    const detail = await getCustomer(admin, id);
    expect(detail?.invoices?.[0]?.status).toBe("overdue");
  });
});

describe("related lists", () => {
  it("counts active projects and scopes projects to staff ownership", async () => {
    const admin = await createTestUser("admin");
    const staff = await createTestUser("staff");
    const { id } = await createCustomer(admin, customerInput());
    await ProjectModel.create({ projectNumber: "PRJ-1", name: "Website", customer: id, category: "web_development", status: "in_progress", createdBy: admin.id });
    await ProjectModel.create({ projectNumber: "PRJ-2", name: "SEO", customer: id, category: "digital_marketing", status: "completed", assignedTo: staff.id, createdBy: admin.id });
    const forAdmin = await getCustomer(admin, id);
    expect(forAdmin?.projects).toHaveLength(2);
    expect(forAdmin?.activeProjects).toBe(1);
    const forStaff = await getCustomer(staff, id);
    expect(forStaff?.projects.map((p) => p.projectNumber)).toEqual(["PRJ-2"]);
    expect(forStaff?.activeProjects).toBe(0);
  });
});

describe("billing snapshot", () => {
  it("returns the exact shape used by quotations and invoices", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput());
    expect(await getCustomerBillingSnapshot(id)).toEqual({
      name: "Priya Raman",
      businessName: "Hotel Sri Murugan",
      email: "priya@example.com",
      phone: "98765 43210",
      address: "12 Adivaram Road – 624601",
      city: "Palani",
      state: "Tamil Nadu",
      stateCode: "33",
      gstin: "33ABCDE1234F1Z5",
    });
  });

  it("handles blank optional fields and unknown customers", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createCustomer(admin, customerInput({ businessName: "", email: "", address: "", pincode: "", state: "", gstin: "" }));
    const snapshot = await getCustomerBillingSnapshot(id);
    expect(snapshot).toMatchObject({ businessName: "", address: "", state: "", stateCode: "", gstin: "" });
    await expect(getCustomerBillingSnapshot(new Types.ObjectId().toString())).rejects.toThrow(NotFoundError);
  });
});
