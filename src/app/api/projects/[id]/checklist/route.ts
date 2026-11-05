import { apiRoute, parseBody } from "@/lib/api/handler";
import { checklistItemSchema } from "@/lib/validations/project";
import { addChecklistItem } from "@/services/project.service";

export const POST = apiRoute({ permission: "projects:write" }, async ({ req, user, params }) => {
  const { title } = await parseBody(req, checklistItemSchema);
  return addChecklistItem(user, params.id, title);
});
