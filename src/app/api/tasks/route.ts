import { apiRoute, parseBody } from "@/lib/api/handler";
import { PRIORITIES } from "@/lib/constants";
import { enumParam, parseListParams } from "@/lib/list-params";
import { TASK_VIEWS, taskFormSchema } from "@/lib/validations/task";
import { createTask, defaultTaskSort, listTasks, TASK_SORTS } from "@/services/task.service";

export const GET = apiRoute({ permission: "tasks:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const view = enumParam(sp, "view", TASK_VIEWS) ?? "today";
  const defaults = defaultTaskSort(view);
  const params = parseListParams(sp, { sortable: TASK_SORTS, defaultSort: defaults.sort, defaultDir: defaults.dir });
  return listTasks(user, view, params, { assignedTo: sp.assignedTo, priority: enumParam(sp, "priority", PRIORITIES) });
});

export const POST = apiRoute({ permission: "tasks:write" }, async ({ req, user }) => {
  return createTask(user, await parseBody(req, taskFormSchema));
});
