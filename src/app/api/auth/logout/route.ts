import { apiRoute } from "@/lib/api/handler";
import { clearSessionCookie, deleteSessionByToken, readSessionCookie } from "@/lib/auth/session";
import { logActivity } from "@/services/activity.service";

export const POST = apiRoute({ auth: false }, async ({ user }) => {
  const token = await readSessionCookie();
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie();
  if (user) {
    await logActivity({
      actor: user,
      action: "auth.logout",
      entityType: "auth",
      entityId: user.id,
      entityLabel: user.name,
      message: `${user.name} signed out`,
      sensitive: true,
    });
  }
  return { ok: true };
});
