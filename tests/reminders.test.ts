import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import { NotificationModel } from "@/models/notification";
import { TaskModel } from "@/models/task";
import { createNotificationOnce, isAuthorizedCronRequest, istDayKey, runReminders } from "@/services/reminder.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

const NOW = new Date("2026-10-23T06:00:00.000Z"); // 11:30 IST
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

async function makeTask(assignedTo: string, overrides: Record<string, unknown> = {}) {
  return TaskModel.create({
    title: "Call Hotel Sri Murugan",
    assignedTo,
    createdBy: assignedTo,
    dueAt: minutes(30),
    reminderMinutes: 60,
    remindAt: minutes(-30),
    status: "todo" as const,
    ...overrides,
  });
}

let leadSeq = 0;
async function makeLead(assignedTo: string | undefined, overrides: Record<string, unknown> = {}) {
  leadSeq += 1;
  return LeadModel.create({
    leadNumber: `LD-T${String(leadSeq).padStart(4, "0")}`,
    contactName: "Priya Raman",
    phone: "98765 43210",
    source: "whatsapp" as const,
    status: "follow_up" as const,
    assignedTo,
    nextFollowUpAt: minutes(5),
    createdBy: assignedTo ?? new Types.ObjectId(),
    ...overrides,
  });
}

async function makeInvoice(createdBy: string, overrides: Record<string, unknown> = {}) {
  const total = 1_180_000;
  return InvoiceModel.create({
    invoiceNumber: `RDS/26-27/${String(++leadSeq).padStart(4, "0")}`,
    customer: new Types.ObjectId(),
    billTo: { name: "Priya Raman" },
    issueDate: new Date("2026-09-01T00:00:00+05:30"),
    dueDate: new Date("2026-10-01T00:00:00+05:30"),
    items: [{ description: "Website", quantity: 1, unitPricePaise: total, amountPaise: total, taxablePaise: total, totalPaise: total }],
    totals: { subtotalPaise: total, taxablePaise: total, totalPaise: total },
    amountPaidPaise: 0,
    balancePaise: total,
    status: "sent" as const,
    createdBy,
    ...overrides,
  });
}

describe("task reminders", () => {
  it("claims each due task once, even when two runs overlap", async () => {
    const staff = await createTestUser("staff");
    const task = await makeTask(staff.id);

    const [a, b] = await Promise.all([runReminders(NOW), runReminders(NOW)]);
    expect(a.tasks.claimed + b.tasks.claimed).toBe(1);
    expect(a.tasks.notified + b.tasks.notified).toBe(1);

    const notes = await NotificationModel.find({ user: staff.id, type: "task.reminder" }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].dedupeKey).toBe(`task-reminder:${task._id}:${task.remindAt!.toISOString()}`);
    expect(notes[0].link).toBe("/tasks");

    const saved = await TaskModel.findById(task._id).lean();
    expect(saved?.reminderSentAt?.toISOString()).toBe(NOW.toISOString());

    // A later run finds nothing left to send.
    const again = await runReminders(minutes(15));
    expect(again.tasks.claimed).toBe(0);
  });

  it("skips completed, cancelled, future and already-sent reminders", async () => {
    const staff = await createTestUser("staff");
    await makeTask(staff.id, { status: "completed", completedAt: NOW });
    await makeTask(staff.id, { status: "cancelled" });
    await makeTask(staff.id, { remindAt: minutes(10) });
    await makeTask(staff.id, { reminderSentAt: minutes(-5) });
    await makeTask(staff.id, { remindAt: undefined, reminderMinutes: 0 });

    const result = await runReminders(NOW);
    expect(result.tasks.claimed).toBe(0);
    expect(await NotificationModel.countDocuments()).toBe(0);
  });

  it("sends again after the task's reminder is reset with a new time", async () => {
    const staff = await createTestUser("staff");
    const task = await makeTask(staff.id);
    await runReminders(NOW);
    // The Tasks module unsets reminderSentAt when the due time changes.
    await TaskModel.updateOne({ _id: task._id }, { $set: { remindAt: minutes(10) }, $unset: { reminderSentAt: 1 } });
    const later = await runReminders(minutes(20));
    expect(later.tasks.notified).toBe(1);
    expect(await NotificationModel.countDocuments({ user: staff.id })).toBe(2);
  });

  it("works without email configured", async () => {
    const staff = await createTestUser("staff");
    await makeTask(staff.id);
    const result = await runReminders(NOW);
    expect(result.emailConfigured).toBe(false);
    expect(result.tasks.emailed).toBe(0);
    expect(result.tasks.notified).toBe(1);
  });
});

describe("lead follow-ups", () => {
  it("notifies the assignee once per follow-up time", async () => {
    const staff = await createTestUser("staff");
    const lead = await makeLead(staff.id);

    const first = await runReminders(NOW);
    const second = await runReminders(minutes(15));
    expect(first.leadFollowUps.notified).toBe(1);
    expect(second.leadFollowUps.notified).toBe(0);

    const notes = await NotificationModel.find({ type: "lead.follow_up" }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].user.toString()).toBe(staff.id);
    expect(notes[0].dedupeKey).toBe(`lead-followup:${lead._id}:${minutes(5).toISOString()}`);
    expect(notes[0].link).toBe(`/leads/${lead._id}`);

    // Rescheduling creates a new, separate reminder.
    await LeadModel.updateOne({ _id: lead._id }, { nextFollowUpAt: minutes(25) });
    const third = await runReminders(minutes(15));
    expect(third.leadFollowUps.notified).toBe(1);
  });

  it("ignores closed, archived, unassigned and out-of-window leads", async () => {
    const staff = await createTestUser("staff");
    await makeLead(staff.id, { status: "won" });
    await makeLead(staff.id, { status: "lost" });
    await makeLead(staff.id, { archivedAt: NOW });
    await makeLead(undefined);
    await makeLead(staff.id, { nextFollowUpAt: minutes(16) }); // too early
    await makeLead(staff.id, { nextFollowUpAt: minutes(-60 * 25) }); // more than a day ago

    const result = await runReminders(NOW);
    expect(result.leadFollowUps.notified).toBe(0);
    expect(await NotificationModel.countDocuments()).toBe(0);
  });

  it("does not notify deactivated assignees", async () => {
    const gone = await createTestUser("staff", { isActive: false });
    await makeLead(gone.id);
    const result = await runReminders(NOW);
    expect(result.leadFollowUps.notified).toBe(0);
  });
});

describe("overdue invoices", () => {
  it("alerts every active admin once per invoice per IST day", async () => {
    const owner = await createTestUser("super_admin");
    const admin = await createTestUser("admin");
    await createTestUser("admin", { isActive: false });
    const manager = await createTestUser("manager");
    const invoice = await makeInvoice(owner.id);

    const first = await runReminders(NOW);
    expect(first.overdueInvoices).toEqual({ invoices: 1, notified: 2 });
    const sameDay = await runReminders(minutes(120));
    expect(sameDay.overdueInvoices.notified).toBe(0);

    const notes = await NotificationModel.find({ type: "invoice.overdue" }).lean();
    expect(notes.map((n) => n.user.toString()).sort()).toEqual([owner.id, admin.id].sort());
    expect(notes.some((n) => n.user.toString() === manager.id)).toBe(false);
    expect(notes[0].dedupeKey).toMatch(new RegExp(`^invoice-overdue:${invoice._id}:2026-10-23:`));

    // Next IST day (00:10 IST on 24 Oct is still 23 Oct in UTC) → a fresh alert.
    const nextDay = await runReminders(new Date("2026-10-23T18:40:00.000Z"));
    expect(nextDay.overdueInvoices.notified).toBe(2);
  });

  it("ignores paid, draft, cancelled, zero-balance and not-yet-due invoices", async () => {
    const owner = await createTestUser("super_admin");
    await makeInvoice(owner.id, { status: "paid", balancePaise: 0 });
    await makeInvoice(owner.id, { status: "draft", invoiceNumber: undefined });
    await makeInvoice(owner.id, { status: "cancelled" });
    await makeInvoice(owner.id, { status: "partially_paid", balancePaise: 0 });
    // Due today (IST) is not overdue yet.
    await makeInvoice(owner.id, { dueDate: new Date("2026-10-23T00:00:00+05:30") });

    const result = await runReminders(NOW);
    expect(result.overdueInvoices).toEqual({ invoices: 0, notified: 0 });
  });
});

describe("helpers", () => {
  it("computes the IST calendar day", () => {
    expect(istDayKey(new Date("2026-10-23T18:29:59.000Z"))).toBe("2026-10-23");
    expect(istDayKey(new Date("2026-10-23T18:30:00.000Z"))).toBe("2026-10-24");
    expect(istDayKey(new Date("2026-03-31T20:00:00.000Z"))).toBe("2026-04-01");
  });

  it("reports whether a notification was newly created", async () => {
    const staff = await createTestUser("staff");
    const input = { type: "test", title: "Hello", dedupeKey: "test:1" };
    expect(await createNotificationOnce(staff.id, input)).toBe(true);
    expect(await createNotificationOnce(staff.id, input)).toBe(false);
  });

  it("checks the cron bearer token", () => {
    const secret = "a-very-long-cron-secret";
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCronRequest(secret, secret)).toBe(false);
    expect(isAuthorizedCronRequest(null, secret)).toBe(false);
  });
});
