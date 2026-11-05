import { apiRoute, parseBody } from "@/lib/api/handler";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseDateInputIST } from "@/lib/utils/date";
import { paymentFormSchema } from "@/lib/validations/finance";
import { listPayments, PAYMENT_SORTS, recordPayment } from "@/services/payment.service";

const dateParam = (value: string | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateInputIST(value) : undefined;

export const GET = apiRoute({ permission: "payments:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  return listPayments(user, parseListParams(sp, { sortable: PAYMENT_SORTS, defaultSort: "paidAt" }), {
    method: enumParam(sp, "method", PAYMENT_METHODS),
    status: enumParam(sp, "status", PAYMENT_STATUSES),
    customer: sp.customer,
    invoice: sp.invoice,
    from: dateParam(sp.from),
    to: dateParam(sp.to),
  });
});

export const POST = apiRoute({ permission: "payments:write" }, async ({ req, user }) => {
  await enforceRateLimit(`payments:${user.id}`, 60, 60);
  return recordPayment(user, await parseBody(req, paymentFormSchema));
});
