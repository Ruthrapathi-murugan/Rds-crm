import { apiRoute, parseBody } from "@/lib/api/handler";
import { QUOTATION_STATUSES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { quotationFormSchema } from "@/lib/validations/finance";
import { createQuotation, listQuotations, QUOTATION_SORTS } from "@/services/quotation.service";

export const GET = apiRoute({ permission: "quotations:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  return listQuotations(user, parseListParams(sp, { sortable: QUOTATION_SORTS, defaultSort: "issueDate" }), {
    status: enumParam(sp, "status", QUOTATION_STATUSES),
    customer: sp.customer,
  });
});

export const POST = apiRoute({ permission: "quotations:write" }, async ({ req, user }) =>
  createQuotation(user, await parseBody(req, quotationFormSchema)),
);
