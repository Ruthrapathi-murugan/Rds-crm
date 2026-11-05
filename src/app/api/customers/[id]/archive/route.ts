import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { setCustomerArchived } from "@/services/customer.service";

const schema = z.object({ archived: z.boolean() });

export const POST = apiRoute({ permission: "customers:archive" }, async ({ req, user, params }) => {
  const { archived } = await parseBody(req, schema);
  return setCustomerArchived(user, params.id, archived);
});
