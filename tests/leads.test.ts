import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { convertLeadSchema, leadFormSchema } from "@/lib/validations/lead";
import { CustomerModel } from "@/models/customer";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import {
  addLeadCommunication,
  changeLeadStatus,
  convertLead,
  createLead,
  getLead,
  leadStatusCounts,
  listLeads,
  setLeadArchived,
} from "@/services/lead.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

const params = { page: 1, pageSize: 20, q: "", sort: "createdAt" as const, dir: "desc" as const };

function leadInput(overrides: Record<string, unknown> = {}) {
  return leadFormSchema.parse({
    contactName: "Priya Raman",
    businessName: "Hotel Sri Murugan",
    phone: "98765 43210",
    email: "PRIYA@example.com",
    source: "whatsapp",
    estimatedValue: "45,000.50",
    status: "new",
    ...overrides,
  });
}

describe("lead validation", () => {
  it("converts rupees to paise and normalises fields", () => {
    const data = leadInput();
    expect(data.estimatedValue).toBe(4_500_050);
    expect(data.email).toBe("priya@example.com");
    expect(data.assignedTo).toBeNull();
  });

  it("rejects bad phone numbers and unknown sources", () => {
    expect(leadFormSchema.safeParse({ ...leadInput(), phone: "12", estimatedValue: "1" }).success).toBe(false);
    expect(leadFormSchema.safeParse({ contactName: "X", phone: "9876543210", source: "tv", status: "new" }).success).toBe(false);
  });

  it("strips unknown fields (no mass assignment)", () => {
    const parsed = leadFormSchema.parse({ ...leadInput(), estimatedValue: "1", convertedCustomer: "x", createdBy: "y" });
    expect(parsed).not.toHaveProperty("convertedCustomer");
    expect(parsed).not.toHaveProperty("createdBy");
  });
});

describe("lead lifecycle", () => {
  it("numbers leads sequentially and never starts them as won", async () => {
    const admin = await createTestUser("admin");
    const a = await createLead(admin, leadInput({ status: "won" }));
    const b = await createLead(admin, leadInput());
    expect(a.leadNumber).toBe("LD-00001");
    expect(b.leadNumber).toBe("LD-00002");
    expect((await LeadModel.findById(a.id).lean())?.status).toBe("qualified");
  });

  it("logs communications and moves new leads to contacted", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    const followUp = new Date("2026-11-01T05:00:00Z");
    await addLeadCommunication(admin, id, { type: "call", summary: "Discussed website", occurredAt: new Date(), nextFollowUpAt: followUp });
    const lead = await getLead(admin, id);
    expect(lead?.status).toBe("contacted");
    expect(lead?.communications).toHaveLength(1);
    expect(lead?.nextFollowUpAt).toBe(followUp.toISOString());
  });

  it("refuses to mark won without conversion", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    await expect(changeLeadStatus(admin, id, { status: "won", lostReason: "", nextFollowUpAt: null })).rejects.toThrow(
      ConflictError,
    );
  });

  it("archives leads out of the default list", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    await setLeadArchived(admin, id, true);
    expect((await listLeads(admin, params)).total).toBe(0);
    expect((await listLeads(admin, params, { archived: true })).total).toBe(1);
  });

  it("searches and filters", async () => {
    const admin = await createTestUser("admin");
    await createLead(admin, leadInput());
    await createLead(admin, leadInput({ contactName: "Karthik", businessName: "Palani Textiles", source: "referral" }));
    expect((await listLeads(admin, { ...params, q: "textiles" })).rows[0]?.contactName).toBe("Karthik");
    expect((await listLeads(admin, params, { source: "whatsapp" })).total).toBe(1);
    // Regex characters in search are treated literally.
    expect((await listLeads(admin, { ...params, q: ".*" })).total).toBe(0);
  });
});

describe("record-level access", () => {
  it("limits staff to their own leads", async () => {
    const admin = await createTestUser("admin");
    const staffA = await createTestUser("staff");
    const staffB = await createTestUser("staff");
    const own = await createLead(staffA, leadInput());
    const assigned = await createLead(admin, leadInput({ assignedTo: staffB.id }));

    expect((await listLeads(staffA, params)).rows.map((r) => r.id)).toEqual([own.id]);
    expect((await listLeads(staffB, params)).rows.map((r) => r.id)).toEqual([assigned.id]);
    expect(await getLead(staffB, own.id)).toBeNull();
    await expect(changeLeadStatus(staffB, own.id, { status: "lost", lostReason: "", nextFollowUpAt: null })).rejects.toThrow(
      NotFoundError,
    );
    expect((await listLeads(admin, params)).total).toBe(2);
    expect((await leadStatusCounts(staffA)).new).toBe(1);
  });
});

describe("lead conversion", () => {
  const convertInput = (overrides: Record<string, unknown> = {}) =>
    convertLeadSchema.parse({ customerType: "hotel", createProject: true, projectName: "Hotel website", quotedAmount: "60000", ...overrides });

  it("creates a customer and project and marks the lead won", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    const result = await convertLead(admin, id, convertInput());

    const customer = await CustomerModel.findById(result.customerId).lean();
    const project = await ProjectModel.findById(result.projectId).lean();
    const lead = await LeadModel.findById(id).lean();
    expect(customer).toMatchObject({ name: "Priya Raman", businessName: "Hotel Sri Murugan", type: "hotel", customerNumber: "CU-00001" });
    expect(project).toMatchObject({ name: "Hotel website", quotedAmountPaise: 6_000_000, projectNumber: "PRJ-00001" });
    expect(lead?.status).toBe("won");
    expect(lead?.convertedCustomer?.toString()).toBe(result.customerId);
  });

  it("rejects a second conversion", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    await convertLead(admin, id, convertInput({ createProject: false }));
    await expect(convertLead(admin, id, convertInput({ createProject: false }))).rejects.toThrow(ConflictError);
    expect(await CustomerModel.countDocuments()).toBe(1);
  });

  it("creates exactly one customer under concurrent conversions", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => convertLead(admin, id, convertInput({ createProject: false }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    }
    expect(await CustomerModel.countDocuments()).toBe(1);
    expect(await ProjectModel.countDocuments()).toBe(0);
  });

  it("rolls back the customer when the project step fails", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createLead(admin, leadInput());
    await expect(
      convertLead(admin, id, convertInput({ projectService: "64b7f0c2a1b2c3d4e5f60789" })),
    ).rejects.toThrow();
    expect(await CustomerModel.countDocuments()).toBe(0);
    expect((await LeadModel.findById(id).lean())?.convertedCustomer).toBeUndefined();
  });
});
