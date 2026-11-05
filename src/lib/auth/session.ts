import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Types } from "mongoose";
import { getServerEnv } from "@/lib/env";
import { connectToDatabase } from "@/lib/mongodb";
import { SessionModel } from "@/models/session";
import { UserModel, type UserDoc } from "@/models/user";
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from "./constants";

/** Only an HMAC of the token is stored; the raw token lives in the cookie. */
export function hashSessionToken(token: string): string {
  return createHmac("sha256", getServerEnv().AUTH_SECRET).update(token).digest("base64url");
}

export async function createSession(
  userId: Types.ObjectId | string,
  meta: { ipAddress?: string; userAgent?: string },
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  await connectToDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_IDLE_TTL_MS);
  await SessionModel.create({
    tokenHash: hashSessionToken(token),
    user: userId,
    expiresAt,
    lastSeenAt: now,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { token, expiresAt };
}

/**
 * Validates a raw session token against the database. Returns null when the
 * session is unknown, expired, past its absolute lifetime, or the user is
 * inactive. Slides the expiry forward on activity.
 */
export async function validateSessionToken(
  token: string,
  now = new Date(),
): Promise<{ user: UserDoc; tokenHash: string } | null> {
  if (!token || token.length > 100) return null;
  await connectToDatabase();
  const tokenHash = hashSessionToken(token);
  const session = await SessionModel.findOne({ tokenHash, expiresAt: { $gt: now } }).lean();
  if (!session) return null;

  if (now.getTime() - session.createdAt.getTime() > SESSION_ABSOLUTE_TTL_MS) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const user = await UserModel.findById(session.user).lean();
  if (!user || !user.isActive) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  // A password change after the session started invalidates it.
  if (user.passwordChangedAt && user.passwordChangedAt > session.createdAt) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    const absoluteEnd = session.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
    await SessionModel.updateOne(
      { _id: session._id },
      { lastSeenAt: now, expiresAt: new Date(Math.min(now.getTime() + SESSION_IDLE_TTL_MS, absoluteEnd)) },
    );
  }

  return { user, tokenHash };
}

export async function deleteSessionByToken(token: string) {
  await connectToDatabase();
  await SessionModel.deleteOne({ tokenHash: hashSessionToken(token) });
}

/** Signs a user out everywhere, optionally keeping the current session. */
export async function revokeUserSessions(userId: Types.ObjectId | string, keepTokenHash?: string) {
  await connectToDatabase();
  await SessionModel.deleteMany({
    user: userId,
    ...(keepTokenHash ? { tokenHash: { $ne: keepTokenHash } } : {}),
  });
}

// ── Cookie helpers (route handlers and server actions only) ───────────────

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
