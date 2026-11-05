import { apiRoute, parseBody } from "@/lib/api/handler";
import { leadStatusSchema } from "@/lib/validations/lead";
import { changeLeadStatus } from "@/services/lead.service";

export const PATCH = apiRoute({ permission: "leads:write" }, async ({ req, user, params }) => {
  return changeLeadStatus(user, params.id, await parseBody(req, leadStatusSchema));
});
