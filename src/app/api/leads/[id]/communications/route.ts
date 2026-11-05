import { apiRoute, parseBody } from "@/lib/api/handler";
import { communicationFormSchema } from "@/lib/validations/lead";
import { addLeadCommunication } from "@/services/lead.service";

export const POST = apiRoute({ permission: "leads:write" }, async ({ req, user, params }) => {
  return addLeadCommunication(user, params.id, await parseBody(req, communicationFormSchema));
});
