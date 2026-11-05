import { apiRoute, parseBody } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { customerFormSchema } from "@/lib/validations/customer";
import { getCustomer, updateCustomer } from "@/services/customer.service";

export const GET = apiRoute({ permission: "customers:read" }, async ({ user, params }) => {
  const customer = await getCustomer(user, params.id);
  if (!customer) throw new NotFoundError("Customer");
  return customer;
});

export const PUT = apiRoute({ permission: "customers:write" }, async ({ req, user, params }) => {
  return updateCustomer(user, params.id, await parseBody(req, customerFormSchema));
});
