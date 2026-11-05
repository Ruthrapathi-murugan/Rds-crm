import "server-only";
import type { Types } from "mongoose";
import { isDuplicateKeyError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/mongodb";
import { NotificationModel } from "@/models/notification";
import type { SessionUser } from "@/types";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

/**
 * Creates an in-app notification. Skips notifying people about their own
 * actions, and a `dedupeKey` makes repeated reminders idempotent.
 */
export async function notify(
  recipient: Types.ObjectId | string | null | undefined,
  input: { type: string; title: string; message?: string; link?: string; dedupeKey?: string },
  actor?: Pick<SessionUser, "id"> | null,
) {
  if (!recipient) return;
  if (actor && recipient.toString() === actor.id) return;
  try {
    await connectToDatabase();
    await NotificationModel.create({ user: recipient, ...input });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      console.error("[notify] failed:", error instanceof Error ? error.message : error);
    }
  }
}

export async function listNotifications(user: SessionUser, limit = 20) {
  await connectToDatabase();
  const [rows, unreadCount] = await Promise.all([
    NotificationModel.find({ user: user.id }).sort({ createdAt: -1 }).limit(limit).lean(),
    NotificationModel.countDocuments({ user: user.id, readAt: null }),
  ]);
  const items: NotificationItem[] = rows.map((n) => ({
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message ?? "",
    link: n.link ?? null,
    read: Boolean(n.readAt),
    createdAt: n.createdAt.toISOString(),
  }));
  return { items, unreadCount };
}

export async function markNotificationsRead(user: SessionUser, ids: string[] | "all") {
  await connectToDatabase();
  await NotificationModel.updateMany(
    { user: user.id, readAt: null, ...(ids === "all" ? {} : { _id: { $in: ids } }) },
    { readAt: new Date() },
  );
}
