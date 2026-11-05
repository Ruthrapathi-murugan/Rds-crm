import { apiRoute, parseBody } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { leadFormSchema } from "@/lib/validations/lead";
import { getLead, updateLead } from "@/services/lead.service";

export const GET = apiRoute({ permission: "leads:read" }, async ({ user, params }) => {
  const lead = await getLead(user, params.id);
  if (!lead) throw new NotFoundError("Lead");
  return lead;
});

export const PUT = apiRoute({ permission: "leads:write" }, async ({ req, user, params }) => {
  return updateLead(user, params.id, await parseBody(req, leadFormSchema));
});
