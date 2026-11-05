import { apiRoute, parseBody } from "@/lib/api/handler";
import { communicationFormSchema } from "@/lib/validations/lead";
import { addCustomerCommunication } from "@/services/customer.service";

export const POST = apiRoute({ permission: "customers:write" }, async ({ req, user, params }) => {
  const { type, summary, occurredAt } = await parseBody(req, communicationFormSchema);
  return addCustomerCommunication(user, params.id, { type, summary, occurredAt });
});
