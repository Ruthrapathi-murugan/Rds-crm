import { apiRoute, parseBody } from "@/lib/api/handler";
import { INVOICE_STATUSES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { parseDateInputIST } from "@/lib/utils/date";
import { invoiceFormSchema } from "@/lib/validations/finance";
import { createInvoice, INVOICE_SORTS, listInvoices } from "@/services/invoice.service";

const dateParam = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return parseDateInputIST(value);
};

export const GET = apiRoute({ permission: "invoices:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  return listInvoices(user, parseListParams(sp, { sortable: INVOICE_SORTS, defaultSort: "issueDate" }), {
    status: enumParam(sp, "status", INVOICE_STATUSES),
    customer: sp.customer,
    project: sp.project,
    from: dateParam(sp.from),
    to: dateParam(sp.to),
  });
});

export const POST = apiRoute({ permission: "invoices:write" }, async ({ req, user }) =>
  createInvoice(user, await parseBody(req, invoiceFormSchema)),
);
