import { apiRoute, parseBody } from "@/lib/api/handler";
import { taskStatusSchema } from "@/lib/validations/task";
import { setTaskStatus } from "@/services/task.service";

export const PATCH = apiRoute({ permission: "tasks:write" }, async ({ req, user, params }) => {
  const { status } = await parseBody(req, taskStatusSchema);
  return setTaskStatus(user, params.id, status);
});
