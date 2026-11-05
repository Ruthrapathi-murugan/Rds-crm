import { apiRoute, parseBody } from "@/lib/api/handler";
import { projectProgressSchema } from "@/lib/validations/project";
import { setProjectProgress } from "@/services/project.service";

export const PATCH = apiRoute({ permission: "projects:write" }, async ({ req, user, params }) => {
  const { progress } = await parseBody(req, projectProgressSchema);
  return setProjectProgress(user, params.id, progress);
});
