import { apiRoute, parseBody } from "@/lib/api/handler";
import { checklistToggleSchema } from "@/lib/validations/project";
import { deleteChecklistItem, toggleChecklistItem } from "@/services/project.service";

export const PATCH = apiRoute({ permission: "projects:write" }, async ({ req, user, params }) => {
  const { done } = await parseBody(req, checklistToggleSchema);
  return toggleChecklistItem(user, params.id, params.itemId, done);
});

export const DELETE = apiRoute({ permission: "projects:write" }, async ({ user, params }) => {
  return deleteChecklistItem(user, params.id, params.itemId);
});
