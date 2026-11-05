import { apiRoute } from "@/lib/api/handler";
import { monthKey } from "@/lib/utils/date";
import { tasksForCalendar } from "@/services/task.service";

export const GET = apiRoute({ permission: "tasks:read" }, async ({ req, user }) => {
  const month = req.nextUrl.searchParams.get("month") || monthKey(new Date());
  return tasksForCalendar(user, month);
});
