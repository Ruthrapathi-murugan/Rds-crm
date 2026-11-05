import { apiRoute, parseBody } from "@/lib/api/handler";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { leadFormSchema } from "@/lib/validations/lead";
import { createLead, LEAD_SORTS, listLeads } from "@/services/lead.service";

export const GET = apiRoute({ permission: "leads:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const params = parseListParams(sp, { sortable: LEAD_SORTS, defaultSort: "createdAt" });
  return listLeads(user, params, {
    status: enumParam(sp, "status", LEAD_STATUSES),
    source: enumParam(sp, "source", LEAD_SOURCES),
    assignedTo: sp.assignedTo,
    followUp: enumParam(sp, "followUp", ["overdue", "today", "upcoming"] as const),
    archived: sp.archived === "1",
  });
});

export const POST = apiRoute({ permission: "leads:write" }, async ({ req, user }) => {
  return createLead(user, await parseBody(req, leadFormSchema));
});
