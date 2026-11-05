import { apiRoute, parseBody } from "@/lib/api/handler";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { customerFormSchema } from "@/lib/validations/customer";
import { createCustomer, CUSTOMER_SORTS, listCustomers } from "@/services/customer.service";

export const GET = apiRoute({ permission: "customers:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const params = parseListParams(sp, { sortable: CUSTOMER_SORTS, defaultSort: "createdAt" });
  return listCustomers(user, params, {
    type: enumParam(sp, "type", CUSTOMER_TYPES),
    status: enumParam(sp, "status", CUSTOMER_STATUSES),
    archived: sp.archived === "1",
  });
});

export const POST = apiRoute({ permission: "customers:write" }, async ({ req, user }) => {
  return createCustomer(user, await parseBody(req, customerFormSchema));
});
