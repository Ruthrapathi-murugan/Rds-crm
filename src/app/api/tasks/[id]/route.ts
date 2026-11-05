import { apiRoute, parseBody } from "@/lib/api/handler";
import { taskFormSchema } from "@/lib/validations/task";
import { deleteTask, updateTask } from "@/services/task.service";

export const PUT = apiRoute({ permission: "tasks:write" }, async ({ req, user, params }) => {
  return updateTask(user, params.id, await parseBody(req, taskFormSchema));
});

export const DELETE = apiRoute({ permission: "tasks:write" }, async ({ user, params }) => {
  return deleteTask(user, params.id);
});
