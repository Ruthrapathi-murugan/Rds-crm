import { apiRoute, parseBody } from "@/lib/api/handler";
import { assertPermission } from "@/lib/auth/current-user";
import { convertLeadSchema } from "@/lib/validations/lead";
import { convertLead } from "@/services/lead.service";

export const POST = apiRoute({ permission: "leads:convert" }, async ({ req, user, params }) => {
  const input = await parseBody(req, convertLeadSchema);
  assertPermission(user, "customers:write");
  if (input.createProject) assertPermission(user, "projects:write");
  return convertLead(user, params.id, input);
});
