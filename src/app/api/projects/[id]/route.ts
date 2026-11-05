import { apiRoute, parseBody } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { projectFormSchema } from "@/lib/validations/project";
import { getProject, updateProject } from "@/services/project.service";

export const GET = apiRoute({ permission: "projects:read" }, async ({ user, params }) => {
  const project = await getProject(user, params.id);
  if (!project) throw new NotFoundError("Project");
  return project;
});

export const PUT = apiRoute({ permission: "projects:write" }, async ({ req, user, params }) => {
  return updateProject(user, params.id, await parseBody(req, projectFormSchema));
});
