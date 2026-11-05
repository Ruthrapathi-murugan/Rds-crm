import { apiRoute } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { objectId } from "@/lib/validations/common";
import { resetUserPassword } from "@/services/user.service";

export const POST = apiRoute({ permission: "users:manage" }, async ({ user, params }) => {
  await enforceRateLimit(`password-reset:${user.id}`, 20, 60 * 60);
  return resetUserPassword(user, objectId.parse(params.id));
});
