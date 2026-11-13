import { beforeEach, describe, expect, it } from "vitest";
import { CounterModel } from "@/models/counter";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import { getCompanySettings } from "@/services/settings.service";
import { importInvoices, type InvoiceImportFile } from "@/services/invoice-import.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

const company = {
  companyName: "Ruthra Digital Solutions",
  email: "hello@example.com",
  website: "www.example.com",
  addressLine1: "No 2, 1, Mill Rd, Shanmugapuram",
  city: "Palani",
  state: "Tamil Nadu",
  pincode: "624601",
  gstin: "33ABCDE1234F1Z5",
};

const contact = (n: number) => ({
  name: `Hotel ${n}`,
  businessName: `Hotel ${n} Pvt`,
  phone: `98765432${10 + n}`,
  email: `hotel${n}@example.com`,
  address: `${n} Main Road`,
  city: "Palani",
  state: "Tamil Nadu",
  pincode: "624601",
  gstin: "33AAAAA0000A1Z5",
  type: "hotel" as const,
});

const file = (): InvoiceImportFile => ({
  company,
  invoices: [
    {
      number: 3,
      issueDate: "2026-09-03",
      dueDate: "2026-09-10",
      taxMode: "intra_state",
      expectedTotal: "4506.42",
      customer: { ...contact(2), gstin: "33BBBBB1111B1Z5" },
      items: [{ sacCode: "998323", description: "Hospitality support", quantity: 1, unitPrice: "3819", taxRate: "18" }],
    },
    {
      number: 1,
      issueDate: "2026-05-24",
      dueDate: "2026-05-31",
      taxMode: "intra_state",
      expectedTotal: "19470.00",
      customer: contact(1),
      items: [
        { sacCode: "998314", description: "Website Development", quantity: 1, unitPrice: "15000", taxRate: "18" },
        { sacCode: "998315", description: "Hosting", quantity: 1, unitPrice: "1500", taxRate: "18" },
      ],
    },
  ],
});

describe("invoice import", () => {
  it("creates won leads, customers and invoices under their original numbers", async () => {
    const admin = await createTestUser("super_admin");
    await importInvoices(admin, file());

    const settings = await getCompanySettings();
    expect(settings.gstRegistered).toBe(true);
    expect(settings.addressLine1).toContain("Shanmugapuram");

    const invoices = await InvoiceModel.find().sort({ invoiceNumber: 1 }).lean();
    expect(invoices.map((i) => i.invoiceNumber)).toEqual(["RDS/26-27/0001", "RDS/26-27/0003"]);
    expect(invoices.map((i) => i.totals.totalPaise)).toEqual([1_947_000, 450_642]);
    expect(invoices[0].totals.cgstPaise).toBe(148_500);
    expect(invoices[1].items[0].sacCode).toBe("998323");
    expect(invoices[0].seller?.address).toContain("Shanmugapuram");
    expect(invoices.every((i) => i.status === "sent")).toBe(true);

    const customers = await CustomerModel.find().lean();
    expect(customers).toHaveLength(2);
    const first = customers.find((c) => c.name === "Hotel 1")!;
    expect(first).toMatchObject({ gstin: "33AAAAA0000A1Z5", address: "1 Main Road", pincode: "624601", type: "hotel" });
    expect(invoices[0].customer.toString()).toBe(first._id.toString());

    const leads = await LeadModel.find().lean();
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.status === "won" && l.convertedCustomer)).toBe(true);

    // The next invoice continues after the highest imported number.
    expect((await CounterModel.findById("invoice:RDS:26-27").lean())?.seq).toBe(3);
  });

  it("can be re-run without creating duplicates", async () => {
    const admin = await createTestUser("super_admin");
    await importInvoices(admin, file());
    const report = await importInvoices(admin, file());
    expect(report.some((l) => l.includes("already exists — skipped"))).toBe(true);
    expect(await InvoiceModel.countDocuments()).toBe(2);
    expect(await CustomerModel.countDocuments()).toBe(2);
    expect(await LeadModel.countDocuments()).toBe(2);
  });

  it("fills a number skipped by an earlier import and reuses the customer", async () => {
    const admin = await createTestUser("super_admin");
    await importInvoices(admin, file());
    const later = file();
    later.invoices.push({
      number: 2,
      issueDate: "2026-09-01",
      dueDate: "2026-09-08",
      taxMode: "intra_state",
      expectedTotal: "18150.76",
      customer: contact(1),
      items: [{ sacCode: "998323", description: "Commission", quantity: 1, unitPrice: "15382", taxRate: "18" }],
    });
    await importInvoices(admin, later);

    const invoices = await InvoiceModel.find().sort({ invoiceNumber: 1 }).lean();
    expect(invoices.map((i) => i.invoiceNumber)).toEqual(["RDS/26-27/0001", "RDS/26-27/0002", "RDS/26-27/0003"]);
    expect(invoices[1].totals).toMatchObject({ cgstPaise: 138_438, sgstPaise: 138_438, totalPaise: 1_815_076 });
    expect(invoices[1].customer.toString()).toBe(invoices[0].customer.toString());
    expect(await CustomerModel.countDocuments()).toBe(2);
    expect(await LeadModel.countDocuments()).toBe(2);
    expect((await CounterModel.findById("invoice:RDS:26-27").lean())?.seq).toBe(3);
  });

  it("reuses a lead added by hand without an owner and keeps its number free", async () => {
    const admin = await createTestUser("super_admin");
    await LeadModel.collection.insertOne({
      leadNumber: "LD-00001",
      contactName: "Hotel 1",
      phone: contact(1).phone,
      source: "other",
      status: "new",
      communications: [],
    });
    await importInvoices(admin, file());
    const leads = await LeadModel.find().sort({ leadNumber: 1 }).lean();
    expect(leads.map((l) => l.leadNumber)).toEqual(["LD-00001", "LD-00002"]);
    expect(leads[0].createdBy?.toString()).toBe(admin.id);
    expect(leads[0].status).toBe("won");
  });

  it("refuses to import when the app's total differs from the original", async () => {
    const admin = await createTestUser("super_admin");
    const bad = file();
    bad.invoices[0].expectedTotal = "4500.00";
    await expect(importInvoices(admin, bad)).rejects.toThrow(/original says/);
    expect(await InvoiceModel.countDocuments()).toBe(0);
    expect(await LeadModel.countDocuments()).toBe(0);
  });

  it("writes nothing on a dry run", async () => {
    const admin = await createTestUser("super_admin");
    const report = await importInvoices(admin, file(), { dryRun: true });
    expect(report.filter((l) => l.startsWith("Would import"))).toHaveLength(2);
    expect(await InvoiceModel.countDocuments()).toBe(0);
    expect((await getCompanySettings()).gstin).toBe("");
  });
});
