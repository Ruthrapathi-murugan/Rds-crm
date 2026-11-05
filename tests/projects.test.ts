import { beforeEach, describe, expect, it } from "vitest";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { projectFormSchema } from "@/lib/validations/project";
import { ActivityLogModel } from "@/models/activity-log";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { NotificationModel } from "@/models/notification";
import { PaymentModel } from "@/models/payment";
import { ProjectModel } from "@/models/project";
import { ServiceModel } from "@/models/service";
import {
  addChecklistItem,
  changeProjectStatus,
  createProject,
  deleteChecklistItem,
  getProject,
  listProjects,
  projectBoard,
  projectOptions,
  projectStatusCounts,
  setProjectArchived,
  setProjectProgress,
  toggleChecklistItem,
  updateProject,
} from "@/services/project.service";
import type { SessionUser } from "@/types";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

const params = { page: 1, pageSize: 20, q: "", sort: "createdAt" as const, dir: "desc" as const };

let customerSeq = 0;
async function createCustomer(user: SessionUser, overrides: Record<string, unknown> = {}) {
  customerSeq += 1;
  const customer = await CustomerModel.create({
    customerNumber: `CU-T${customerSeq}`,
    name: "Priya Raman",
    businessName: "Hotel Sri Murugan",
    phone: "9876543210",
    createdBy: user.id,
    ...overrides,
  });
  return customer._id.toString();
}

function projectInput(customer: string, overrides: Record<string, unknown> = {}) {
  return projectFormSchema.parse({
    name: "Hotel website redesign",
    customer,
    category: "web_development",
    quotedAmount: "60,000",
    advanceAmount: "20000",
    priority: "high",
    status: "not_started",
    progress: "0",
    ...overrides,
  });
}

describe("project validation", () => {
  const customer = "64b7f0c2a1b2c3d4e5f60789";

  it("converts money to paise and dates to IST start of day", () => {
    const data = projectInput(customer, { startDate: "2026-11-01", dueDate: "2026-11-30" });
    expect(data.quotedAmount).toBe(6_000_000);
    expect(data.advanceAmount).toBe(2_000_000);
    expect(data.startDate?.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(data.service).toBeNull();
  });

  it("rejects an advance larger than the quote", () => {
    const result = projectFormSchema.safeParse({ ...rawInput(customer), quotedAmount: "10000", advanceAmount: "10000.01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["advanceAmount"]);
  });

  it("rejects a due date before the start date but allows the same day", () => {
    const bad = projectFormSchema.safeParse({ ...rawInput(customer), startDate: "2026-11-10", dueDate: "2026-11-09" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["dueDate"]);
    expect(projectFormSchema.safeParse({ ...rawInput(customer), startDate: "2026-11-10", dueDate: "2026-11-10" }).success).toBe(true);
  });

  it("requires a customer and keeps progress within 0–100", () => {
    expect(projectFormSchema.safeParse({ ...rawInput(customer), customer: "" }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...rawInput(customer), progress: "101" }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...rawInput(customer), progress: "12.5" }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const parsed = projectFormSchema.parse({ ...rawInput(customer), completedAt: "x", createdBy: "y", projectNumber: "PRJ-9" });
    expect(parsed).not.toHaveProperty("completedAt");
    expect(parsed).not.toHaveProperty("projectNumber");
  });

  function rawInput(c: string) {
    return { name: "Site", customer: c, category: "web_development", priority: "medium", status: "not_started", progress: "0" };
  }
});

describe("project lifecycle", () => {
  it("numbers projects, derives the category from the service and notifies the assignee", async () => {
    const admin = await createTestUser("admin");
    const staff = await createTestUser("staff");
    const customer = await createCustomer(admin);
    const service = await ServiceModel.create({ name: "SEO", slug: "seo", category: "digital_marketing" });
    const a = await createProject(admin, projectInput(customer, { service: service._id.toString(), assignedTo: staff.id }));
    const b = await createProject(admin, projectInput(customer));
    expect(a.projectNumber).toBe("PRJ-00001");
    expect(b.projectNumber).toBe("PRJ-00002");
    expect((await ProjectModel.findById(a.id).lean())?.category).toBe("digital_marketing");
    expect(await NotificationModel.countDocuments({ user: staff.id, type: "project.assigned" })).toBe(1);
    expect(await ActivityLogModel.countDocuments({ entityType: "project", action: "project.created" })).toBe(2);
  });

  it("rejects missing or archived customers and unknown services", async () => {
    const admin = await createTestUser("admin");
    const archived = await createCustomer(admin, { archivedAt: new Date() });
    await expect(createProject(admin, projectInput(archived))).rejects.toThrow(BadRequestError);
    await expect(createProject(admin, projectInput("64b7f0c2a1b2c3d4e5f60789"))).rejects.toThrow(BadRequestError);
    const customer = await createCustomer(admin);
    await expect(createProject(admin, projectInput(customer, { service: "64b7f0c2a1b2c3d4e5f60789" }))).rejects.toThrow(BadRequestError);
    expect(await ProjectModel.countDocuments()).toBe(0);
  });

  it("sets completedAt and 100% on completion and clears completedAt when reopened", async () => {
    const admin = await createTestUser("admin");
    const customer = await createCustomer(admin);
    const { id } = await createProject(admin, projectInput(customer, { progress: "40" }));
    const done = await changeProjectStatus(admin, id, "completed");
    expect(done.progress).toBe(100);
    let doc = await ProjectModel.findById(id).lean();
    expect(doc?.completedAt).toBeInstanceOf(Date);
    expect(doc?.progress).toBe(100);
    await expect(setProjectProgress(admin, id, 60)).rejects.toThrow(ConflictError);

    await changeProjectStatus(admin, id, "in_progress");
    doc = await ProjectModel.findById(id).lean();
    expect(doc?.completedAt).toBeUndefined();
    await setProjectProgress(admin, id, 75);
    expect((await ProjectModel.findById(id).lean())?.progress).toBe(75);
    expect(await ActivityLogModel.countDocuments({ entityId: id, action: "project.status_changed" })).toBe(2);
  });

  it("applies the completion rule when status changes through the edit form", async () => {
    const admin = await createTestUser("admin");
    const customer = await createCustomer(admin);
    const { id } = await createProject(admin, projectInput(customer, { status: "completed", progress: "10" }));
    let doc = await ProjectModel.findById(id).lean();
    expect(doc?.progress).toBe(100);
    expect(doc?.completedAt).toBeInstanceOf(Date);
    await updateProject(admin, id, projectInput(customer, { status: "on_hold", progress: "90" }));
    doc = await ProjectModel.findById(id).lean();
    expect(doc?.status).toBe("on_hold");
    expect(doc?.completedAt).toBeUndefined();
  });

  it("adds, toggles and deletes checklist items", async () => {
    const admin = await createTestUser("admin");
    const customer = await createCustomer(admin);
    const { id } = await createProject(admin, projectInput(customer));
    await addChecklistItem(admin, id, "Collect logo");
    const list = await addChecklistItem(admin, id, "Build homepage");
    expect(list.map((i) => i.title)).toEqual(["Collect logo", "Build homepage"]);

    const toggled = await toggleChecklistItem(admin, id, list[0].id, true);
    expect(toggled[0]).toMatchObject({ done: true, doneByName: admin.name });
    expect(toggled[0].doneAt).not.toBeNull();
    const reopened = await toggleChecklistItem(admin, id, list[0].id, false);
    expect(reopened[0]).toMatchObject({ done: false, doneAt: null, doneByName: null });

    const remaining = await deleteChecklistItem(admin, id, list[1].id);
    expect(remaining).toHaveLength(1);
    await expect(deleteChecklistItem(admin, id, list[1].id)).rejects.toThrow(NotFoundError);
    const detail = await getProject(admin, id);
    expect(detail?.checklistTotal).toBe(1);
    expect(await ActivityLogModel.countDocuments({ entityId: id, action: /^project\.checklist/ })).toBe(5);
  });

  it("blocks changes to archived projects and hides them from the default list", async () => {
    const admin = await createTestUser("admin");
    const customer = await createCustomer(admin);
    const { id } = await createProject(admin, projectInput(customer));
    await setProjectArchived(admin, id, true);
    await expect(addChecklistItem(admin, id, "x")).rejects.toThrow(ConflictError);
    expect((await listProjects(admin, params)).total).toBe(0);
    expect((await listProjects(admin, params, { archived: true })).total).toBe(1);
    expect(await projectOptions(admin, "")).toHaveLength(0);
  });
});

describe("project lists", () => {
  it("filters overdue by IST day and active status, and searches by number", async () => {
    const admin = await createTestUser("admin");
    const customer = await createCustomer(admin);
    const yesterday = new Date(Date.now() - 86_400_000);
    const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
    const late = await createProject(admin, projectInput(customer, { name: "Late", dueDate: ymd(yesterday) }));
    await createProject(admin, projectInput(customer, { name: "Due today", dueDate: ymd(new Date()) }));
    await createProject(admin, projectInput(customer, { name: "Done late", dueDate: ymd(yesterday), status: "completed" }));

    const overdue = await listProjects(admin, params, { overdue: true });
    expect(overdue.rows.map((r) => r.id)).toEqual([late.id]);
    expect(overdue.rows[0].overdue).toBe(true);
    expect((await listProjects(admin, { ...params, q: "PRJ-00002" })).rows[0]?.name).toBe("Due today");
    expect((await listProjects(admin, { ...params, q: "(" })).total).toBe(0);

    const counts = await projectStatusCounts(admin);
    expect(counts.not_started).toBe(2);
    expect(counts.completed).toBe(1);
    const board = await projectBoard(admin, "");
    expect(board.not_started).toHaveLength(2);
    expect(Object.keys(board)).not.toContain("completed");
  });

  it("limits staff to projects assigned to or created by them", async () => {
    const admin = await createTestUser("admin");
    const staffA = await createTestUser("staff");
    const staffB = await createTestUser("staff");
    const customer = await createCustomer(admin);
    const own = await createProject(staffA, projectInput(customer));
    const assigned = await createProject(admin, projectInput(customer, { assignedTo: staffB.id }));
    await createProject(admin, projectInput(customer));

    expect((await listProjects(staffA, params)).rows.map((r) => r.id)).toEqual([own.id]);
    expect((await listProjects(staffB, params)).rows.map((r) => r.id)).toEqual([assigned.id]);
    expect((await listProjects(staffB, params, { assignedTo: "me" })).total).toBe(1);
    expect(await getProject(staffB, own.id)).toBeNull();
    await expect(changeProjectStatus(staffB, own.id, "in_progress")).rejects.toThrow(NotFoundError);
    await expect(addChecklistItem(staffB, own.id, "x")).rejects.toThrow(NotFoundError);
    expect((await projectOptions(staffA, "")).map((o) => o.value)).toEqual([own.id]);
    expect((await listProjects(admin, params)).total).toBe(3);
    expect((await listProjects(admin, params, { assignedTo: "unassigned" })).total).toBe(2);
  });
});

describe("project financial summary", () => {
  it("sums issued invoices and recorded payments for the project only", async () => {
    const admin = await createTestUser("admin");
    const customer = await createCustomer(admin);
    const { id } = await createProject(admin, projectInput(customer, { quotedAmount: "100000", advanceAmount: "30000" }));
    const other = await createProject(admin, projectInput(customer));

    const invoice = (status: "sent" | "partially_paid" | "paid" | "draft" | "cancelled", totalPaise: number, project = id) => ({
      customer,
      project,
      billTo: { name: "Priya Raman" },
      issueDate: new Date(),
      dueDate: new Date(),
      items: [{ description: "Website", quantity: 1, unitPricePaise: totalPaise, amountPaise: totalPaise, taxablePaise: totalPaise, totalPaise }],
      totals: { subtotalPaise: totalPaise, taxablePaise: totalPaise, totalPaise },
      status,
      createdBy: admin.id,
    });
    await InvoiceModel.create([
      invoice("sent", 4_000_000),
      invoice("partially_paid", 2_000_000),
      invoice("paid", 1_000_000),
      invoice("draft", 9_900_000),
      invoice("cancelled", 9_900_000),
      invoice("paid", 9_900_000, other.id),
    ]);
    const payment = (n: number, amountPaise: number, status: "recorded" | "voided" = "recorded", project = id) => ({
      paymentNumber: `PAY-T${n}`,
      customer,
      project,
      paidAt: new Date(),
      amountPaise,
      method: "upi" as const,
      status,
      createdBy: admin.id,
    });
    await PaymentModel.create([payment(1, 3_000_000), payment(2, 1_500_000), payment(3, 5_000_000, "voided"), payment(4, 7_000_000, "recorded", other.id)]);

    const detail = await getProject(admin, id);
    expect(detail?.financials).toEqual({
      quotedPaise: 10_000_000,
      advanceAgreedPaise: 3_000_000,
      invoicedPaise: 7_000_000,
      receivedPaise: 4_500_000,
      remainingPaise: 5_500_000,
    });

    // Overpayment never shows a negative balance.
    await PaymentModel.create(payment(5, 9_000_000));
    expect((await getProject(admin, id))?.financials?.remainingPaise).toBe(0);
  });
});
