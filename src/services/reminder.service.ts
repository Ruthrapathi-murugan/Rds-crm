import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import type { Types } from "mongoose";
import { OPEN_LEAD_STATUSES, OPEN_TASK_STATUSES, PRIORITY_LABELS, RECEIVABLE_INVOICE_STATUSES, type Priority } from "@/lib/constants";
import { leadFollowUpEmail, taskReminderEmail } from "@/lib/email-templates";
import { getServerEnv, isEmailConfigured } from "@/lib/env";
import { isDuplicateKeyError } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import { connectToDatabase } from "@/lib/mongodb";
import { APP_TIME_ZONE, formatDate, formatDateTime, startOfDayIST } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import { NotificationModel } from "@/models/notification";
import { TaskModel } from "@/models/task";
import { UserModel } from "@/models/user";
import { getCompanySettings } from "./settings.service";

/** Upper bound of task reminders handled per run; the rest wait for the next run. */
export const TASK_REMINDER_BATCH = 200;
/** Lead follow-ups are announced from 15 minutes before they are due… */
export const LEAD_FOLLOW_UP_LEAD_TIME_MS = 15 * 60_000;
/** …and up to a day afterwards, so a missed run still catches them. */
export const LEAD_FOLLOW_UP_LOOKBACK_MS = 24 * 60 * 60_000;
const LEAD_BATCH = 500;
const INVOICE_BATCH = 500;

const inIST = tz(APP_TIME_ZONE);

/** IST calendar day key, e.g. "2026-10-23". */
export function istDayKey(value: Date): string {
  return format(value, "yyyy-MM-dd", { in: inIST });
}

/**
 * Inserts a notification unless one with the same `dedupeKey` exists.
 * Returns true only when a new notification was created, so callers can
 * avoid sending a matching email twice.
 */
export async function createNotificationOnce(
  recipient: Types.ObjectId | string,
  input: { type: string; title: string; message?: string; link?: string; dedupeKey: string },
): Promise<boolean> {
  try {
    await NotificationModel.create({ user: recipient, ...input });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    console.error("[reminders] notification failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header. Both
 * sides are hashed first so their lengths never leak through timing.
 */
export function isAuthorizedCronRequest(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(authorization.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

type Recipient = { id: string; name: string; email: string };

async function activeUsers(ids: (Types.ObjectId | string | null | undefined)[]): Promise<Map<string, Recipient>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const users = await UserModel.find({ _id: { $in: unique }, isActive: true }).select("name email").lean();
  return new Map(users.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name, email: u.email }]));
}

export type ReminderRunResult = {
  ranAt: string;
  emailConfigured: boolean;
  tasks: { claimed: number; notified: number; emailed: number };
  leadFollowUps: { due: number; notified: number; emailed: number };
  overdueInvoices: { invoices: number; notified: number };
};

async function runTaskReminders(now: Date, companyName: () => Promise<string>, emailOn: boolean) {
  const result = { claimed: 0, notified: 0, emailed: 0 };
  const candidates = await TaskModel.find({
    status: { $in: OPEN_TASK_STATUSES },
    remindAt: { $lte: now },
    reminderSentAt: null,
  })
    .select("_id")
    .sort({ remindAt: 1 })
    .limit(TASK_REMINDER_BATCH)
    .lean();

  for (const { _id } of candidates) {
    // Atomic claim: only one concurrent run can flip reminderSentAt from unset.
    const task = await TaskModel.findOneAndUpdate(
      { _id, reminderSentAt: null, status: { $in: OPEN_TASK_STATUSES }, remindAt: { $lte: now } },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after" },
    ).lean();
    if (!task || !task.remindAt) continue;
    result.claimed += 1;

    const assignee = (await activeUsers([task.assignedTo])).get(String(task.assignedTo));
    if (!assignee) continue;
    const created = await createNotificationOnce(assignee.id, {
      type: "task.reminder",
      title: `Reminder: ${task.title}`,
      message: `Due ${formatDateTime(task.dueAt)}`,
      link: "/tasks",
      dedupeKey: `task-reminder:${task._id}:${task.remindAt.toISOString()}`,
    });
    if (!created) continue;
    result.notified += 1;

    if (emailOn) {
      const mail = taskReminderEmail({
        companyName: await companyName(),
        recipientName: assignee.name,
        taskTitle: task.title,
        dueAt: task.dueAt,
        priorityLabel: PRIORITY_LABELS[task.priority as Priority],
      });
      const sent = await sendMail({ to: assignee.email, ...mail });
      if (sent.sent) result.emailed += 1;
    }
  }
  return result;
}

async function runLeadFollowUps(now: Date, companyName: () => Promise<string>, emailOn: boolean) {
  const result = { due: 0, notified: 0, emailed: 0 };
  const leads = await LeadModel.find({
    archivedAt: null,
    status: { $in: OPEN_LEAD_STATUSES },
    assignedTo: { $ne: null },
    nextFollowUpAt: {
      $gte: new Date(now.getTime() - LEAD_FOLLOW_UP_LOOKBACK_MS),
      $lte: new Date(now.getTime() + LEAD_FOLLOW_UP_LEAD_TIME_MS),
    },
  })
    .select("leadNumber contactName businessName phone assignedTo nextFollowUpAt")
    .sort({ nextFollowUpAt: 1 })
    .limit(LEAD_BATCH)
    .lean();
  result.due = leads.length;
  const users = await activeUsers(leads.map((l) => l.assignedTo));

  for (const lead of leads) {
    const assignee = users.get(String(lead.assignedTo));
    if (!assignee || !lead.nextFollowUpAt) continue;
    const created = await createNotificationOnce(assignee.id, {
      type: "lead.follow_up",
      title: `Follow up with ${lead.contactName}`,
      message: [lead.businessName, `Due ${formatDateTime(lead.nextFollowUpAt)}`].filter(Boolean).join(" · "),
      link: `/leads/${lead._id}`,
      dedupeKey: `lead-followup:${lead._id}:${lead.nextFollowUpAt.toISOString()}`,
    });
    if (!created) continue;
    result.notified += 1;

    if (emailOn) {
      const mail = leadFollowUpEmail({
        companyName: await companyName(),
        recipientName: assignee.name,
        leadId: lead._id.toString(),
        contactName: lead.contactName,
        businessName: lead.businessName ?? "",
        phone: lead.phone ?? "",
        followUpAt: lead.nextFollowUpAt,
      });
      const sent = await sendMail({ to: assignee.email, ...mail });
      if (sent.sent) result.emailed += 1;
    }
  }
  return result;
}

async function runOverdueInvoices(now: Date) {
  const result = { invoices: 0, notified: 0 };
  const invoices = await InvoiceModel.find({
    status: { $in: RECEIVABLE_INVOICE_STATUSES },
    balancePaise: { $gt: 0 },
    dueDate: { $lt: startOfDayIST(now) },
  })
    .select("invoiceNumber billTo.name balancePaise dueDate")
    .sort({ dueDate: 1 })
    .limit(INVOICE_BATCH)
    .lean();
  result.invoices = invoices.length;
  if (!invoices.length) return result;

  const admins = await UserModel.find({ role: { $in: ["admin", "super_admin"] }, isActive: true }).select("_id").lean();
  const day = istDayKey(now);
  for (const invoice of invoices) {
    const label = invoice.invoiceNumber ?? "Invoice";
    for (const admin of admins) {
      // The dedupe index is global, so the key includes the recipient.
      const created = await createNotificationOnce(admin._id, {
        type: "invoice.overdue",
        title: `${label} is overdue`,
        message: `${invoice.billTo?.name ?? "Customer"} · ${formatINR(invoice.balancePaise ?? 0)} due since ${formatDate(invoice.dueDate)}`,
        link: `/invoices/${invoice._id}`,
        dedupeKey: `invoice-overdue:${invoice._id}:${day}:${admin._id}`,
      });
      if (created) result.notified += 1;
    }
  }
  return result;
}

/**
 * Sends due task reminders, lead follow-up alerts and daily overdue-invoice
 * alerts. Safe to run concurrently and repeatedly: tasks are claimed
 * atomically and every notification carries a unique dedupe key.
 */
export async function runReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  await connectToDatabase();
  let emailOn = false;
  try {
    emailOn = isEmailConfigured(getServerEnv());
  } catch {
    emailOn = false;
  }
  let company: Promise<string> | undefined;
  const companyName = () => (company ??= getCompanySettings().then((s) => s.companyName));

  const tasks = await runTaskReminders(now, companyName, emailOn);
  const leadFollowUps = await runLeadFollowUps(now, companyName, emailOn);
  const overdueInvoices = await runOverdueInvoices(now);
  return { ranAt: now.toISOString(), emailConfigured: emailOn, tasks, leadFollowUps, overdueInvoices };
}
