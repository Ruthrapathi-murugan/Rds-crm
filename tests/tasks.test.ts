import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { taskFormSchema } from "@/lib/validations/task";
import { ActivityLogModel } from "@/models/activity-log";
import { CustomerModel } from "@/models/customer";
import { LeadModel } from "@/models/lead";
import { NotificationModel } from "@/models/notification";
import { ProjectModel } from "@/models/project";
import { TaskModel } from "@/models/task";
import {
  computeRemindAt,
  createTask,
  deleteTask,
  listTasks,
  setTaskStatus,
  taskViewCounts,
  tasksForCalendar,
  tasksForEntity,
  updateTask,
} from "@/services/task.service";
import type { SessionUser } from "@/types";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterEach(() => vi.useRealTimers());

const params = { page: 1, pageSize: 50, q: "", sort: "dueAt" as const, dir: "asc" as const };

function taskInput(assignedTo: string, overrides: Record<string, unknown> = {}) {
  return taskFormSchema.parse({
    title: "Call about website content",
    assignedTo,
    dueAt: "2026-10-23T15:00",
    priority: "medium",
    status: "todo",
    reminderMinutes: "0",
    ...overrides,
  });
}

/** Freezes only Date so the MongoDB driver's timers keep working. */
function freezeNow(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

async function titles(user: SessionUser, view: Parameters<typeof listTasks>[1]) {
  return (await listTasks(user, view, params)).rows.map((r) => r.title).sort();
}

describe("task validation", () => {
  it("reads due times as IST wall-clock time and coerces reminder minutes", () => {
    const data = taskInput("64b7f0c2a1b2c3d4e5f60789", { dueAt: "2026-10-23T23:30", reminderMinutes: "60" });
    expect(data.dueAt.toISOString()).toBe("2026-10-23T18:00:00.000Z");
    expect(data.reminderMinutes).toBe(60);
    expect(data.lead).toBeNull();
  });

  it("rejects unknown reminder options and a missing assignee", () => {
    expect(taskFormSchema.safeParse({ ...taskInputRaw(), reminderMinutes: "45" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...taskInputRaw(), assignedTo: "" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...taskInputRaw(), dueAt: "2026-10-23" }).success).toBe(false);
  });

  function taskInputRaw() {
    return { title: "x", assignedTo: "64b7f0c2a1b2c3d4e5f60789", dueAt: "2026-10-23T10:00", priority: "low", status: "todo" };
  }
});

describe("task views use Asia/Kolkata day boundaries", () => {
  async function seed() {
    const admin = await createTestUser("admin");
    const at = (dueAt: string, title: string, status = "todo") => createTask(admin, taskInput(admin.id, { dueAt, title, status }));
    await at("2026-10-22T23:30", "yesterday late");
    await at("2026-10-23T09:00", "this morning");
    await at("2026-10-23T23:30", "tonight 23:30");
    await at("2026-10-24T00:30", "tomorrow 00:30");
    await at("2026-10-23T10:00", "done today", "completed");
    await at("2026-10-23T11:00", "cancelled today", "cancelled");
    return admin;
  }

  it("classifies tasks at noon IST (a UTC server would see a different day boundary)", async () => {
    const admin = await seed();
    freezeNow("2026-10-23T12:00:00+05:30");
    expect(await titles(admin, "today")).toEqual(["this morning", "tonight 23:30"]);
    expect(await titles(admin, "upcoming")).toEqual(["tomorrow 00:30"]);
    expect(await titles(admin, "overdue")).toEqual(["this morning", "yesterday late"]);
    expect(await titles(admin, "completed")).toEqual(["done today"]);
    expect((await listTasks(admin, "all", params)).total).toBe(6);
    expect(await taskViewCounts(admin)).toEqual({ today: 2, upcoming: 1, overdue: 2, completed: 1, all: 6 });
  });

  it("keeps a 23:30 IST task in today after 18:00 UTC rolls the UTC date", async () => {
    const admin = await seed();
    // 23:45 IST is 18:15 UTC on the same date; 23:30 IST is now past due.
    freezeNow("2026-10-23T23:45:00+05:30");
    expect(await titles(admin, "today")).toEqual(["this morning", "tonight 23:30"]);
    expect(await titles(admin, "overdue")).toEqual(["this morning", "tonight 23:30", "yesterday late"]);
    expect(await titles(admin, "upcoming")).toEqual(["tomorrow 00:30"]);

    // 00:10 IST the next day: the 00:30 task is now "today".
    freezeNow("2026-10-24T00:10:00+05:30");
    expect(await titles(admin, "today")).toEqual(["tomorrow 00:30"]);
    expect(await titles(admin, "upcoming")).toEqual([]);
  });

  it("returns a calendar month by IST dates", async () => {
    const admin = await createTestUser("admin");
    await createTask(admin, taskInput(admin.id, { title: "last evening", dueAt: "2026-10-31T23:30" }));
    // 00:15 IST on 1 Nov is still 31 Oct in UTC.
    await createTask(admin, taskInput(admin.id, { title: "first minutes of Nov", dueAt: "2026-11-01T00:15" }));
    await createTask(admin, taskInput(admin.id, { title: "first of Oct", dueAt: "2026-10-01T00:00" }));
    await createTask(admin, taskInput(admin.id, { title: "dropped", dueAt: "2026-10-10T10:00", status: "cancelled" }));
    expect((await tasksForCalendar(admin, "2026-10")).map((t) => t.title)).toEqual(["first of Oct", "last evening"]);
    expect((await tasksForCalendar(admin, "2026-11")).map((t) => t.title)).toEqual(["first minutes of Nov"]);
    await expect(tasksForCalendar(admin, "2026-13")).rejects.toThrow(BadRequestError);
  });
});

describe("task reminders", () => {
  it("computes remindAt from the lead time and clears it when reminders are off", async () => {
    const admin = await createTestUser("admin");
    const due = new Date("2026-10-23T18:00:00Z");
    expect(computeRemindAt(due, 0)).toBeUndefined();
    expect(computeRemindAt(due, 1440)?.toISOString()).toBe("2026-10-22T18:00:00.000Z");

    const { id } = await createTask(admin, taskInput(admin.id, { dueAt: "2026-10-23T23:30", reminderMinutes: "60" }));
    expect((await TaskModel.findById(id).lean())?.remindAt?.toISOString()).toBe("2026-10-23T17:00:00.000Z");

    await updateTask(admin, id, taskInput(admin.id, { dueAt: "2026-10-23T23:30", reminderMinutes: "0" }));
    const doc = await TaskModel.findById(id).lean();
    expect(doc?.remindAt).toBeUndefined();
    expect(doc?.reminderMinutes).toBe(0);
  });

  it("resets reminderSentAt only when the due time or lead time changes", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createTask(admin, taskInput(admin.id, { reminderMinutes: "15" }));
    const sent = new Date("2026-10-23T09:15:00Z");
    await TaskModel.updateOne({ _id: id }, { reminderSentAt: sent });

    await updateTask(admin, id, taskInput(admin.id, { reminderMinutes: "15", title: "Renamed" }));
    expect((await TaskModel.findById(id).lean())?.reminderSentAt?.toISOString()).toBe(sent.toISOString());

    await updateTask(admin, id, taskInput(admin.id, { reminderMinutes: "15", dueAt: "2026-10-24T10:00" }));
    let doc = await TaskModel.findById(id).lean();
    expect(doc?.reminderSentAt).toBeUndefined();
    expect(doc?.remindAt?.toISOString()).toBe("2026-10-24T04:15:00.000Z");

    await TaskModel.updateOne({ _id: id }, { reminderSentAt: sent });
    await updateTask(admin, id, taskInput(admin.id, { reminderMinutes: "180", dueAt: "2026-10-24T10:00" }));
    doc = await TaskModel.findById(id).lean();
    expect(doc?.reminderSentAt).toBeUndefined();
    expect(doc?.remindAt?.toISOString()).toBe("2026-10-24T01:30:00.000Z");
  });
});

describe("task status and deletion", () => {
  it("sets completedAt on completion and clears it when reopened", async () => {
    const admin = await createTestUser("admin");
    const staff = await createTestUser("staff");
    const { id } = await createTask(admin, taskInput(staff.id));
    const done = await setTaskStatus(staff, id, "completed");
    expect(done.completedAt).not.toBeNull();
    expect(await NotificationModel.countDocuments({ user: admin.id, type: "task.completed" })).toBe(1);
    await setTaskStatus(staff, id, "in_progress");
    const doc = await TaskModel.findById(id).lean();
    expect(doc?.status).toBe("in_progress");
    expect(doc?.completedAt).toBeUndefined();
    expect(await ActivityLogModel.countDocuments({ entityId: id, action: { $in: ["task.completed", "task.status_changed"] } })).toBe(2);
  });

  it("lets only the creator or a manager delete a task", async () => {
    const manager = await createTestUser("manager");
    const creator = await createTestUser("staff");
    const assignee = await createTestUser("staff");
    const a = await createTask(creator, taskInput(assignee.id));
    const b = await createTask(creator, taskInput(assignee.id));
    await expect(deleteTask(assignee, a.id)).rejects.toThrow(ForbiddenError);
    expect((await listTasks(assignee, "all", params)).rows.find((r) => r.id === a.id)?.canDelete).toBe(false);
    await deleteTask(creator, a.id);
    await deleteTask(manager, b.id);
    expect(await TaskModel.countDocuments()).toBe(0);
    expect(await ActivityLogModel.countDocuments({ action: "task.deleted" })).toBe(2);
  });
});

describe("task access and relations", () => {
  it("limits staff to tasks assigned to or created by them and notifies assignees", async () => {
    const admin = await createTestUser("admin");
    const staffA = await createTestUser("staff");
    const staffB = await createTestUser("staff");
    const mine = await createTask(staffA, taskInput(staffA.id, { title: "mine" }));
    const assigned = await createTask(admin, taskInput(staffB.id, { title: "for B" }));
    await createTask(admin, taskInput(admin.id, { title: "admin only" }));

    expect((await listTasks(staffA, "all", params)).rows.map((r) => r.id)).toEqual([mine.id]);
    expect((await listTasks(staffB, "all", params)).rows.map((r) => r.id)).toEqual([assigned.id]);
    await expect(setTaskStatus(staffB, mine.id, "completed")).rejects.toThrow(NotFoundError);
    expect((await listTasks(admin, "all", params)).total).toBe(3);
    expect(await NotificationModel.countDocuments({ user: staffB.id, type: "task.assigned" })).toBe(1);
    // Reassigning notifies the new assignee.
    await updateTask(admin, assigned.id, taskInput(staffA.id, { title: "for B" }));
    expect(await NotificationModel.countDocuments({ user: staffA.id, type: "task.assigned" })).toBe(1);
  });

  it("validates related records and the user's access to the lead and project", async () => {
    const admin = await createTestUser("admin");
    const staff = await createTestUser("staff");
    const lead = await LeadModel.create({ leadNumber: "LD-1", contactName: "Arun", phone: "9876543210", source: "website", createdBy: admin.id });
    const customer = await CustomerModel.create({ customerNumber: "CU-1", name: "Meena", phone: "9876543211", createdBy: admin.id });
    const project = await ProjectModel.create({
      projectNumber: "PRJ-1",
      name: "Store site",
      customer: customer._id,
      category: "web_development",
      createdBy: admin.id,
    });

    await expect(createTask(staff, taskInput(staff.id, { lead: lead._id.toString() }))).rejects.toThrow(BadRequestError);
    await expect(createTask(staff, taskInput(staff.id, { project: project._id.toString() }))).rejects.toThrow(BadRequestError);
    await expect(createTask(admin, taskInput(admin.id, { customer: "64b7f0c2a1b2c3d4e5f60789" }))).rejects.toThrow(BadRequestError);

    // The customer is filled in from the project.
    const { id } = await createTask(admin, taskInput(admin.id, { project: project._id.toString(), lead: lead._id.toString() }));
    expect((await TaskModel.findById(id).lean())?.customer?.toString()).toBe(customer._id.toString());

    const row = (await listTasks(admin, "all", params)).rows[0];
    expect(row.project).toEqual({ id: project._id.toString(), label: "Store site", href: `/projects/${project._id}` });
    expect(row.customer?.label).toBe("Meena");
    expect(row.lead?.href).toBe(`/leads/${lead._id}`);

    await setTaskStatus(admin, (await createTask(admin, taskInput(admin.id, { project: project._id.toString(), title: "done" }))).id, "completed");
    const entity = await tasksForEntity(admin, { project: project._id.toString() });
    expect(entity.open.map((t) => t.id)).toEqual([id]);
    expect(entity.completed.map((t) => t.title)).toEqual(["done"]);
    expect(entity.prefill.project?.label).toBe("Store site");
    expect(entity.prefill.customer?.label).toBe("Meena");
    expect((await tasksForEntity(staff, { project: project._id.toString() })).open).toHaveLength(0);
  });
});
