import { apiRoute, parseBody } from "@/lib/api/handler";
import { PRIORITIES, PROJECT_STATUSES, SERVICE_CATEGORIES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { projectFormSchema } from "@/lib/validations/project";
import { createProject, listProjects, PROJECT_SORTS } from "@/services/project.service";

export const GET = apiRoute({ permission: "projects:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const params = parseListParams(sp, { sortable: PROJECT_SORTS, defaultSort: "createdAt" });
  return listProjects(user, params, {
    status: enumParam(sp, "status", PROJECT_STATUSES),
    category: enumParam(sp, "category", SERVICE_CATEGORIES),
    priority: enumParam(sp, "priority", PRIORITIES),
    assignedTo: sp.assignedTo,
    customer: sp.customer,
    overdue: sp.overdue === "1",
    archived: sp.archived === "1",
  });
});

export const POST = apiRoute({ permission: "projects:write" }, async ({ req, user }) => {
  return createProject(user, await parseBody(req, projectFormSchema));
});
