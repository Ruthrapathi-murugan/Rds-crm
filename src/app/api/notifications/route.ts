import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { objectId } from "@/lib/validations/common";
import { listNotifications, markNotificationsRead } from "@/services/notification.service";

export const GET = apiRoute({ allowPendingPasswordChange: true }, async ({ user }) => listNotifications(user));

const markReadSchema = z.object({
  ids: z.union([z.literal("all"), z.array(objectId).max(100)]),
});

export const POST = apiRoute({}, async ({ req, user }) => {
  const { ids } = await parseBody(req, markReadSchema);
  await markNotificationsRead(user, ids);
  return { ok: true };
});
