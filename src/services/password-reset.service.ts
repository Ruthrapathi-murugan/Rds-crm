import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { passwordResetDoneEmail, passwordResetOtpEmail } from "@/lib/email-templates";
import { getServerEnv } from "@/lib/env";
import { BadRequestError, isDuplicateKeyError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/mongodb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PasswordResetModel } from "@/models/password-reset";
import { UserModel } from "@/models/user";
import { logActivity } from "./activity.service";
import { deliverEmail } from "./email.service";
import { getCompanySettings } from "./settings.service";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
/** Abandoned records are removed by MongoDB after this long. */
const RECORD_TTL_MS = 30 * 60 * 1000;

/** One message for every OTP failure, so responses never reveal whether an account exists. */
export const INVALID_OTP_MESSAGE = "The code is incorrect or has expired. Check the latest email or request a new code.";
const INVALID_RESET_MESSAGE = "This reset link has expired. Please start again.";

type RequestMeta = { ipAddress: string; userAgent: string };
/** Work to run after the HTTP response is sent (e.g. via Next.js `after()`). */
export type DeferredWork = () => Promise<void>;
const nothing: DeferredWork = async () => {};

function hmac(purpose: string, value: string): string {
  return createHmac("sha256", getServerEnv().AUTH_SECRET).update(`${purpose}:${value}`).digest("base64url");
}

const otpHashFor = (userId: string, otp: string) => hmac("password-reset-otp", `${userId}:${otp}`);
const resetTokenHashFor = (token: string) => hmac("password-reset-token", token);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cryptographically random, uniformly distributed 6-digit code. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Step 1. Always succeeds from the caller's point of view (no account
 * enumeration). For an active account outside the resend cooldown it stores
 * a fresh OTP hash and returns work that emails the code; the route runs that
 * work after responding, so response time does not depend on the account.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta, now = new Date()): Promise<DeferredWork> {
  await connectToDatabase();
  await enforceRateLimit(`pwreset:request:ip:${meta.ipAddress}`, 10, 15 * 60);
  await enforceRateLimit(
    `pwreset:request:email:${email}`,
    5,
    60 * 60,
    "Too many reset requests for this email. Please wait an hour and try again.",
  );

  const user = await UserModel.findOne({ email }).select("name email isActive").lean();
  if (!user || !user.isActive) return nothing;

  const otp = generateOtp();
  const fields = {
    otpHash: otpHashFor(user._id.toString(), otp),
    otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
    attempts: 0,
    lastSentAt: now,
    expiresAt: new Date(now.getTime() + RECORD_TTL_MS),
  };
  // Atomic: only re-issue when no code was sent within the cooldown window.
  let issued: unknown = await PasswordResetModel.findOneAndUpdate(
    { user: user._id, lastSentAt: { $lte: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS) } },
    { $set: fields, $unset: { resetTokenHash: 1, resetTokenExpiresAt: 1 } },
  ).lean();
  if (!issued) {
    try {
      issued = await PasswordResetModel.create({ user: user._id, ...fields });
    } catch (error) {
      // A record already exists inside the cooldown (or a parallel request won): send nothing.
      if (isDuplicateKeyError(error)) return nothing;
      throw error;
    }
  }

  await logActivity({
    action: "auth.password_reset_requested",
    entityType: "auth",
    entityId: user._id,
    entityLabel: user.name,
    message: `Password reset code requested for ${user.name}`,
    sensitive: true,
    ipAddress: meta.ipAddress,
  });

  return async () => {
    const settings = await getCompanySettings();
    await deliverEmail({
      template: "password_reset_otp",
      to: user.email,
      related: { entityType: "user", entityId: user._id },
      message: passwordResetOtpEmail({
        companyName: settings.companyName,
        recipientName: user.name,
        otp,
        validMinutes: OTP_TTL_MS / 60_000,
      }),
    });
  };
}

/**
 * Step 2. Checks the OTP. Each wrong guess is counted atomically; at the
 * limit the code is discarded. A correct code is single-use and is swapped
 * for a random reset token valid for 10 minutes.
 */
export async function verifyPasswordResetOtp(
  input: { email: string; otp: string },
  meta: RequestMeta,
  now = new Date(),
): Promise<{ resetToken: string }> {
  await connectToDatabase();
  await enforceRateLimit(`pwreset:verify:ip:${meta.ipAddress}`, 30, 15 * 60);
  await enforceRateLimit(`pwreset:verify:email:${input.email}`, 15, 15 * 60);
  const invalid = () => new BadRequestError(INVALID_OTP_MESSAGE, { otp: [INVALID_OTP_MESSAGE] });

  const user = await UserModel.findOne({ email: input.email }).select("isActive").lean();
  if (!user || !user.isActive) throw invalid();

  // Count this attempt before comparing, so parallel guesses cannot exceed the limit.
  const record = await PasswordResetModel.findOneAndUpdate(
    {
      user: user._id,
      otpHash: { $exists: true },
      otpExpiresAt: { $gt: now },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!record?.otpHash) throw invalid();

  if (!safeEqual(record.otpHash, otpHashFor(user._id.toString(), input.otp))) {
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await PasswordResetModel.updateOne({ _id: record._id }, { $unset: { otpHash: 1, otpExpiresAt: 1 } });
    }
    throw invalid();
  }

  const resetToken = randomBytes(32).toString("base64url");
  // Consume the OTP; if a parallel request already did, this one fails.
  const consumed = await PasswordResetModel.findOneAndUpdate(
    { _id: record._id, otpHash: record.otpHash },
    {
      $unset: { otpHash: 1, otpExpiresAt: 1 },
      $set: {
        resetTokenHash: resetTokenHashFor(resetToken),
        resetTokenExpiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    },
  ).lean();
  if (!consumed) throw invalid();
  return { resetToken };
}

/**
 * Step 3. Consumes the reset token, sets the new password, signs the user
 * out everywhere and returns work that sends a confirmation email.
 */
export async function completePasswordReset(
  input: { email: string; resetToken: string; newPassword: string },
  meta: RequestMeta,
  now = new Date(),
): Promise<DeferredWork> {
  await connectToDatabase();
  await enforceRateLimit(`pwreset:complete:ip:${meta.ipAddress}`, 20, 15 * 60);

  const record = await PasswordResetModel.findOneAndDelete({
    resetTokenHash: resetTokenHashFor(input.resetToken),
    resetTokenExpiresAt: { $gt: now },
  }).lean();
  if (!record) throw new BadRequestError(INVALID_RESET_MESSAGE);

  const user = await UserModel.findById(record.user).select("name email isActive").lean();
  if (!user || !user.isActive || user.email !== input.email) throw new BadRequestError(INVALID_RESET_MESSAGE);

  await UserModel.updateOne(
    { _id: user._id },
    { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: now, mustChangePassword: false },
  );
  await revokeUserSessions(user._id);
  await logActivity({
    actor: { id: user._id.toString(), name: user.name },
    action: "auth.password_reset",
    entityType: "auth",
    entityId: user._id,
    entityLabel: user.name,
    message: `${user.name} reset their password with an email code`,
    sensitive: true,
    ipAddress: meta.ipAddress,
  });

  return async () => {
    const settings = await getCompanySettings();
    await deliverEmail({
      template: "password_reset_done",
      to: user.email,
      related: { entityType: "user", entityId: user._id },
      message: passwordResetDoneEmail({
        companyName: settings.companyName,
        recipientName: user.name,
        changedAt: now,
        ipAddress: meta.ipAddress,
      }),
    });
  };
}
