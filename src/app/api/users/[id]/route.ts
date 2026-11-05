import { apiRoute, parseBody } from "@/lib/api/handler";
import { objectId } from "@/lib/validations/common";
import { updateUserSchema } from "@/lib/validations/auth";
import { updateUser } from "@/services/user.service";

export const PATCH = apiRoute({ permission: "users:manage" }, async ({ req, user, params }) => {
  const input = await parseBody(req, updateUserSchema);
  return updateUser(user, objectId.parse(params.id), input);
});
