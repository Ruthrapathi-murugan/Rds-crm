import { apiRoute, parseBody } from "@/lib/api/handler";
import { setSessionCookie } from "@/lib/auth/session";
import { getRequestMeta } from "@/lib/request";
import { changePasswordSchema } from "@/lib/validations/auth";
import { changePassword } from "@/services/auth.service";

export const POST = apiRoute({ allowPendingPasswordChange: true }, async ({ req, user }) => {
  const input = await parseBody(req, changePasswordSchema);
  const session = await changePassword(user, input, await getRequestMeta());
  await setSessionCookie(session.token, session.expiresAt);
  return { ok: true };
});
