import "server-only";
import { generateTemporaryPassword, getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, hashSessionToken, revokeUserSessions } from "@/lib/auth/session";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/mongodb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { UserModel } from "@/models/user";
import type { SessionUser } from "@/types";
import { logActivity } from "./activity.service";

const LOGIN_WINDOW_SECONDS = 15 * 60;
const GENERIC_LOGIN_ERROR = "Invalid email or password.";

/**
 * Verifies credentials and opens a session. Attempts are rate limited per
 * email+IP and per IP; failures return one generic message and take the same
 * time whether or not the email exists.
 */
export async function login(
  input: { email: string; password: string },
  meta: { ipAddress: string; userAgent: string },
) {
  await connectToDatabase();
  await enforceRateLimit(`login:ip:${meta.ipAddress}`, 30, LOGIN_WINDOW_SECONDS);
  // Per-account cap regardless of IP, so distributed guessing against one
  // account is limited too (and expensive scrypt work cannot be forced).
  await enforceRateLimit(
    `login:account:${input.email}`,
    20,
    60 * 60,
    "This account has had too many sign-in attempts. Please wait an hour or ask an administrator to reset the password.",
  );
  await enforceRateLimit(
    `login:email:${input.email}:${meta.ipAddress}`,
    8,
    LOGIN_WINDOW_SECONDS,
    "Too many sign-in attempts. Please wait 15 minutes and try again.",
  );

  const user = await UserModel.findOne({ email: input.email }).select("+passwordHash").lean();
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !passwordOk || !user.isActive) {
    await logActivity({
      action: "auth.login_failed",
      entityType: "auth",
      entityId: user?._id,
      message: user && !user.isActive ? "Sign-in attempt on a deactivated account" : "Failed sign-in attempt",
      sensitive: true,
      ipAddress: meta.ipAddress,
    });
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const session = await createSession(user._id, meta);
  await UserModel.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await logActivity({
    actor: { id: user._id.toString(), name: user.name },
    action: "auth.login",
    entityType: "auth",
    entityId: user._id,
    entityLabel: user.name,
    message: `${user.name} signed in`,
    sensitive: true,
    ipAddress: meta.ipAddress,
  });

  return { session, mustChangePassword: Boolean(user.mustChangePassword) };
}

/**
 * Changes the signed-in user's password, signs out every session and opens a
 * fresh one for the current device.
 */
export async function changePassword(
  actor: SessionUser,
  input: { currentPassword: string; newPassword: string },
  meta: { ipAddress: string; userAgent: string },
) {
  await connectToDatabase();
  await enforceRateLimit(`password-change:${actor.id}`, 10, 15 * 60);
  const user = await UserModel.findById(actor.id).select("+passwordHash").lean();
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new BadRequestError("Your current password is incorrect.", {
      currentPassword: ["Your current password is incorrect."],
    });
  }

  await UserModel.updateOne(
    { _id: user._id },
    { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date(), mustChangePassword: false },
  );
  await revokeUserSessions(user._id);
  // Created after passwordChangedAt, so this session stays valid.
  const session = await createSession(user._id, meta);
  await logActivity({
    actor,
    action: "auth.password_changed",
    entityType: "user",
    entityId: user._id,
    entityLabel: user.name,
    message: `${user.name} changed their password`,
    sensitive: true,
    ipAddress: meta.ipAddress,
  });
  return session;
}

export { generateTemporaryPassword, hashSessionToken };
