import { apiRoute, parseBody } from "@/lib/api/handler";
import { projectStatusSchema } from "@/lib/validations/project";
import { changeProjectStatus } from "@/services/project.service";

export const PATCH = apiRoute({ permission: "projects:write" }, async ({ req, user, params }) => {
  const { status } = await parseBody(req, projectStatusSchema);
  return changeProjectStatus(user, params.id, status);
});
