import { apiRoute, parseBody } from "@/lib/api/handler";
import { deleteSessionByToken, readSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { getRequestMeta } from "@/lib/request";
import { loginSchema } from "@/lib/validations/auth";
import { login } from "@/services/auth.service";

export const POST = apiRoute({ auth: false }, async ({ req }) => {
  const input = await parseBody(req, loginSchema);
  const { session, mustChangePassword } = await login(input, await getRequestMeta());
  // End any session this browser already had before switching to the new one.
  const previous = await readSessionCookie();
  if (previous) await deleteSessionByToken(previous);
  await setSessionCookie(session.token, session.expiresAt);
  return { mustChangePassword };
});
