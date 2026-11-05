import "server-only";
import { Types } from "mongoose";
import { addDays } from "date-fns";
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/constants";
import { BadRequestError, ConflictError, isDuplicateKeyError, NotFoundError } from "@/lib/errors";
import { escapeRegex, paginated, skipFor } from "@/lib/list-params";
import { connectToDatabase, withTransaction } from "@/lib/mongodb";
import { startOfDayIST, startOfMonthIST } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type { PaymentFormData } from "@/lib/validations/finance";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel, type PaymentDoc } from "@/models/payment";
import { ProjectModel } from "@/models/project";
import type { ListParams, Paginated, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { recalculateInvoice } from "./invoice.service";
import { isoOrNull, userNames } from "./lookup.service";
import { nextSimpleNumber } from "./numbering.service";
import { andFilters, toObjectId } from "./scope";

export const PAYMENT_SORTS = ["paidAt", "amountPaise", "paymentNumber"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

export type PaymentRow = {
  id: string;
  paymentNumber: string;
  customerId: string;
  customerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  projectId: string | null;
  projectName: string | null;
  paidAt: string;
  amountPaise: number;
  method: PaymentMethod;
  transactionReference: string;
  status: PaymentStatus;
};

export type PaymentDetail = PaymentRow & {
  notes: string;
  customer: { name: string; businessName: string; phone: string; email: string; address: string; gstin: string };
  invoiceTotalPaise: number | null;
  invoiceBalancePaise: number | null;
  createdByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string;
};

async function decorate(docs: PaymentDoc[]): Promise<PaymentRow[]> {
  const customerIds = [...new Set(docs.map((d) => d.customer.toString()))];
  const invoiceIds = [...new Set(docs.map((d) => d.invoice?.toString()).filter(Boolean))] as string[];
  const projectIds = [...new Set(docs.map((d) => d.project?.toString()).filter(Boolean))] as string[];
  const [customers, invoices, projects] = await Promise.all([
    CustomerModel.find({ _id: { $in: customerIds } }).select("name businessName").lean(),
    InvoiceModel.find({ _id: { $in: invoiceIds } }).select("invoiceNumber").lean(),
    ProjectModel.find({ _id: { $in: projectIds } }).select("name").lean(),
  ]);
  const cName = new Map(customers.map((c) => [c._id.toString(), c.businessName || c.name]));
  const iNum = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber ?? null]));
  const pName = new Map(projects.map((p) => [p._id.toString(), p.name]));
  return docs.map((d) => ({
    id: d._id.toString(),
    paymentNumber: d.paymentNumber,
    customerId: d.customer.toString(),
    customerName: cName.get(d.customer.toString()) ?? "",
    invoiceId: d.invoice?.toString() ?? null,
    invoiceNumber: d.invoice ? (iNum.get(d.invoice.toString()) ?? null) : null,
    projectId: d.project?.toString() ?? null,
    projectName: d.project ? (pName.get(d.project.toString()) ?? null) : null,
    paidAt: d.paidAt.toISOString(),
    amountPaise: d.amountPaise,
    method: d.method as PaymentMethod,
    transactionReference: d.transactionReference ?? "",
    status: d.status as PaymentStatus,
  }));
}

export async function listPayments(
  _user: SessionUser,
  params: ListParams<PaymentSort>,
  filters: { method?: PaymentMethod; status?: PaymentStatus; customer?: string; invoice?: string; from?: Date; to?: Date } = {},
): Promise<Paginated<PaymentRow>> {
  await connectToDatabase();
  const base: Record<string, unknown> = {};
  if (filters.method) base.method = filters.method;
  if (filters.status) base.status = filters.status;
  if (filters.customer && Types.ObjectId.isValid(filters.customer)) base.customer = new Types.ObjectId(filters.customer);
  if (filters.invoice && Types.ObjectId.isValid(filters.invoice)) base.invoice = new Types.ObjectId(filters.invoice);
  if (filters.from || filters.to) {
    base.paidAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  }
  let search: Record<string, unknown> = {};
  if (params.q) {
    const re = new RegExp(escapeRegex(params.q), "i");
    const [customers, invoices] = await Promise.all([
      CustomerModel.find({ $or: [{ name: re }, { businessName: re }] }).select("_id").limit(200).lean(),
      InvoiceModel.find({ invoiceNumber: re }).select("_id").limit(200).lean(),
    ]);
    search = {
      $or: [
        { paymentNumber: re },
        { transactionReference: re },
        { customer: { $in: customers.map((c) => c._id) } },
        { invoice: { $in: invoices.map((i) => i._id) } },
      ],
    };
  }
  const query = andFilters(base, search);
  const sort: Record<string, 1 | -1> = { [params.sort]: params.dir === "asc" ? 1 : -1, _id: -1 };
  const [docs, total] = await Promise.all([
    PaymentModel.find(query).sort(sort).skip(skipFor(params)).limit(params.pageSize).lean(),
    PaymentModel.countDocuments(query),
  ]);
  return paginated(await decorate(docs as PaymentDoc[]), total, params);
}

/** Received this month / all time (recorded payments only). */
export async function paymentSummary(now = new Date()) {
  await connectToDatabase();
  const monthStart = startOfMonthIST(now);
  const [row] = await PaymentModel.aggregate<{ total: number; thisMonth: number; count: number }>([
    { $match: { status: "recorded" } },
    {
      $group: {
        _id: null,
        total: { $sum: "$amountPaise" },
        thisMonth: { $sum: { $cond: [{ $gte: ["$paidAt", monthStart] }, "$amountPaise", 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  return row ?? { total: 0, thisMonth: 0, count: 0 };
}

export async function getPayment(_user: SessionUser, id: string): Promise<PaymentDetail | null> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = (await PaymentModel.findById(id).lean()) as PaymentDoc | null;
  if (!doc) return null;
  const [[row], customer, invoice, names] = await Promise.all([
    decorate([doc]),
    CustomerModel.findById(doc.customer).lean(),
    doc.invoice ? InvoiceModel.findById(doc.invoice).select("totals balancePaise").lean() : null,
    userNames([doc.createdBy, doc.voidedBy]),
  ]);
  return {
    ...row,
    notes: doc.notes ?? "",
    customer: {
      name: customer?.name ?? "",
      businessName: customer?.businessName ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: [customer?.address, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(", "),
      gstin: customer?.gstin ?? "",
    },
    invoiceTotalPaise: invoice?.totals?.totalPaise ?? null,
    invoiceBalancePaise: invoice?.balancePaise ?? null,
    createdByName: names.get(doc.createdBy.toString()) ?? null,
    createdAt: doc.createdAt.toISOString(),
    voidedAt: isoOrNull(doc.voidedAt),
    voidedByName: doc.voidedBy ? (names.get(doc.voidedBy.toString()) ?? null) : null,
    voidReason: doc.voidReason ?? "",
  };
}

/**
 * Records a payment received. Everything that matters is decided on the
 * server: the customer comes from the invoice, the amount may not exceed the
 * outstanding balance, the invoice status is recomputed in the same
 * transaction, and the idempotency key plus the unique reference index stop
 * double recording. (No payment gateway is integrated; gateway payments are
 * recorded manually after checking the gateway dashboard.)
 */
export async function recordPayment(user: SessionUser, data: PaymentFormData) {
  await connectToDatabase();

  const existing = await PaymentModel.findOne({ idempotencyKey: data.idempotencyKey }).lean();
  if (existing) {
    return { id: existing._id.toString(), paymentNumber: existing.paymentNumber, duplicate: true };
  }
  if (data.paidAt.getTime() > addDays(startOfDayIST(new Date()), 1).getTime()) {
    throw new BadRequestError("Payment date cannot be in the future.", { paidAt: ["Payment date cannot be in the future"] });
  }

  try {
    const payment = await withTransaction(async (session) => {
      let customerId: Types.ObjectId;
      let projectId: Types.ObjectId | undefined;
      let invoiceId: Types.ObjectId | undefined;
      let invoiceLabel = "";

      if (data.invoice) {
        const invoice = await InvoiceModel.findById(toObjectId(data.invoice, "Invoice")).session(session);
        if (!invoice) throw new NotFoundError("Invoice");
        if (invoice.status === "draft") throw new ConflictError("Issue this invoice before recording payments against it.");
        if (invoice.status === "cancelled") throw new ConflictError("Payments cannot be recorded against a cancelled invoice.");
        if (invoice.status === "paid" || (invoice.balancePaise ?? 0) <= 0) {
          throw new ConflictError("This invoice is already fully paid.");
        }
        if (data.amount > (invoice.balancePaise ?? 0)) {
          throw new BadRequestError(`The amount exceeds the outstanding balance of ${formatINR(invoice.balancePaise ?? 0)}.`, {
            amount: [`Maximum ${formatINR(invoice.balancePaise ?? 0)}`],
          });
        }
        customerId = invoice.customer as Types.ObjectId;
        projectId = (invoice.project as Types.ObjectId | undefined) ?? undefined;
        invoiceId = invoice._id;
        invoiceLabel = ` against ${invoice.invoiceNumber}`;
      } else {
        if (!data.customer) {
          throw new BadRequestError("Choose a customer or an invoice.", { customer: ["Choose a customer"] });
        }
        const customer = await CustomerModel.findById(toObjectId(data.customer, "Customer")).session(session).lean();
        if (!customer) throw new NotFoundError("Customer");
        customerId = customer._id;
        if (data.project) {
          const project = await ProjectModel.findById(toObjectId(data.project, "Project")).session(session).lean();
          if (!project) throw new NotFoundError("Project");
          if (project.customer.toString() !== customer._id.toString()) {
            throw new ConflictError("The selected project belongs to a different customer.");
          }
          projectId = project._id;
        }
      }

      const [created] = await PaymentModel.create(
        [
          {
            paymentNumber: await nextSimpleNumber("payment", session),
            customer: customerId,
            invoice: invoiceId,
            project: projectId,
            paidAt: data.paidAt,
            amountPaise: data.amount,
            method: data.method,
            transactionReference: data.transactionReference || undefined,
            notes: data.notes,
            status: "recorded",
            idempotencyKey: data.idempotencyKey,
            createdBy: user.id,
          },
        ],
        { session },
      );
      if (invoiceId) await recalculateInvoice(invoiceId, session);

      await logActivity(
        {
          actor: user,
          action: "payment.recorded",
          entityType: "payment",
          entityId: created._id,
          entityLabel: created.paymentNumber,
          message: `Recorded ${formatINR(data.amount)} by ${PAYMENT_METHOD_LABELS[data.method]}${invoiceLabel}`,
          sensitive: true,
          meta: { invoiceId: invoiceId?.toString() ?? null, amountPaise: data.amount },
        },
        session,
      );
      if (invoiceId) {
        await logActivity(
          {
            actor: user,
            action: "invoice.payment_recorded",
            entityType: "invoice",
            entityId: invoiceId,
            message: `Payment ${created.paymentNumber} of ${formatINR(data.amount)} recorded`,
            sensitive: true,
          },
          session,
        );
      }
      return created;
    });
    return { id: payment._id.toString(), paymentNumber: payment.paymentNumber, duplicate: false };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const pattern = Object.keys(error.keyPattern ?? {});
      if (pattern.includes("idempotencyKey")) {
        const again = await PaymentModel.findOne({ idempotencyKey: data.idempotencyKey }).lean();
        if (again) return { id: again._id.toString(), paymentNumber: again.paymentNumber, duplicate: true };
      }
      if (pattern.includes("transactionReference")) {
        throw new ConflictError(
          `A ${PAYMENT_METHOD_LABELS[data.method]} payment with reference “${data.transactionReference}” is already recorded.`,
        );
      }
    }
    throw error;
  }
}

/**
 * Voids a payment (kept for audit, excluded from totals) and recomputes the
 * invoice it was applied to.
 */
export async function voidPayment(user: SessionUser, id: string, reason: string) {
  await connectToDatabase();
  return withTransaction(async (session) => {
    const payment = await PaymentModel.findById(toObjectId(id, "Payment")).session(session);
    if (!payment) throw new NotFoundError("Payment");
    if (payment.status === "voided") throw new ConflictError("This payment is already voided.");
    payment.status = "voided";
    payment.voidedAt = new Date();
    payment.voidedBy = new Types.ObjectId(user.id);
    payment.voidReason = reason;
    await payment.save({ session });
    if (payment.invoice) await recalculateInvoice(payment.invoice, session);
    await logActivity(
      {
        actor: user,
        action: "payment.voided",
        entityType: "payment",
        entityId: payment._id,
        entityLabel: payment.paymentNumber,
        message: `Voided payment ${payment.paymentNumber} of ${formatINR(payment.amountPaise)}: ${reason}`,
        sensitive: true,
      },
      session,
    );
    return { id: payment._id.toString() };
  });
}

/** Issued, unpaid invoices for the payment form picker. */
export async function payableInvoiceOptions(q: string, customerId?: string) {
  await connectToDatabase();
  const re = q ? new RegExp(escapeRegex(q.slice(0, 60)), "i") : null;
  const docs = await InvoiceModel.find(
    andFilters(
      { status: { $in: ["sent", "partially_paid"] }, balancePaise: { $gt: 0 } },
      customerId && Types.ObjectId.isValid(customerId) ? { customer: new Types.ObjectId(customerId) } : {},
      re ? { $or: [{ invoiceNumber: re }, { "billTo.name": re }, { "billTo.businessName": re }] } : {},
    ),
  )
    .select("invoiceNumber billTo balancePaise totals customer dueDate")
    .sort({ dueDate: 1 })
    .limit(20)
    .lean();
  return docs.map((d) => ({
    value: d._id.toString(),
    label: `${d.invoiceNumber} · ${d.billTo?.businessName || d.billTo?.name}`,
    description: `Balance ${formatINR(d.balancePaise ?? 0)} of ${formatINR(d.totals?.totalPaise ?? 0)}`,
    balancePaise: d.balancePaise ?? 0,
    customerId: d.customer.toString(),
  }));
}
