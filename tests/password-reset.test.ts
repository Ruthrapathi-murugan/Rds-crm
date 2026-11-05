import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateSessionToken } from "@/lib/auth/session";
import { passwordResetOtpEmail } from "@/lib/email-templates";
import { BadRequestError, RateLimitError } from "@/lib/errors";
import type { MailMessage } from "@/lib/mailer";
import { forgotPasswordSchema, resetPasswordSchema, verifyOtpSchema } from "@/lib/validations/auth";
import { ActivityLogModel } from "@/models/activity-log";
import { EmailLogModel } from "@/models/email-log";
import { PasswordResetModel } from "@/models/password-reset";
import { login } from "@/services/auth.service";
import {
  completePasswordReset,
  generateOtp,
  INVALID_OTP_MESSAGE,
  OTP_MAX_ATTEMPTS,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "@/services/password-reset.service";
import { createTestUser, requestMeta, resetDatabase } from "./helpers";

const sent: MailMessage[] = [];
vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn(async (message: MailMessage) => {
    sent.push(message);
    return { sent: true, messageId: `<m${sent.length}@test>` };
  }),
}));

beforeEach(async () => {
  sent.length = 0;
  await resetDatabase();
});

const NEW_PASSWORD = "brand-new-pass-77";
const later = (ms: number) => new Date(Date.now() + ms);

/** Runs step 1 and returns the code from the captured email. */
async function requestCode(email: string, now = new Date()): Promise<string> {
  const before = sent.length;
  await (await requestPasswordReset(email, requestMeta, now))();
  expect(sent.length).toBe(before + 1);
  const match = /Code: (\d{6})/.exec(sent[sent.length - 1].text);
  expect(match).not.toBeNull();
  return match![1];
}

const wrongCode = (otp: string) => (otp === "000000" ? "111111" : "000000");

describe("generateOtp", () => {
  it("always returns six digits", () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });
});

describe("validation", () => {
  it("normalises email and requires a 6-digit numeric code", () => {
    expect(forgotPasswordSchema.parse({ email: "  Admin@Example.COM " }).email).toBe("admin@example.com");
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "12345" }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "12a456" }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "123456" }).success).toBe(true);
  });

  it("enforces password strength and confirmation", () => {
    const base = { email: "a@b.co", resetToken: "x".repeat(43) };
    expect(resetPasswordSchema.safeParse({ ...base, newPassword: "short1", confirmPassword: "short1" }).success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ ...base, newPassword: NEW_PASSWORD, confirmPassword: "different-pass-1" }).success,
    ).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...base, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }).success).toBe(
      true,
    );
  });
});

describe("requestPasswordReset", () => {
  it("sends nothing for unknown or deactivated accounts, with no visible difference", async () => {
    const inactive = await createTestUser("staff", { isActive: false });
    for (const email of ["nobody@example.com", inactive.email]) {
      const work = await requestPasswordReset(email, requestMeta);
      await work();
    }
    expect(sent).toHaveLength(0);
    expect(await PasswordResetModel.countDocuments()).toBe(0);
  });

  it("emails a code, stores only its hash and logs the email without the body", async () => {
    const user = await createTestUser("staff");
    const otp = await requestCode(user.email);

    const record = await PasswordResetModel.findOne().lean();
    expect(record?.otpHash).toBeTruthy();
    expect(JSON.stringify(record)).not.toContain(otp);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].html).toContain(otp);

    const log = await EmailLogModel.findOne({ template: "password_reset_otp" }).lean();
    expect(log).toMatchObject({ to: user.email, status: "sent" });
    expect(JSON.stringify(log)).not.toContain(otp);
    expect(await ActivityLogModel.exists({ action: "auth.password_reset_requested", sensitive: true })).not.toBeNull();
  });

  it("does not resend within the cooldown, and a resend replaces the earlier code", async () => {
    const user = await createTestUser("staff");
    const first = await requestCode(user.email);

    await (await requestPasswordReset(user.email, requestMeta, later(30_000)))();
    expect(sent).toHaveLength(1);

    const second = await requestCode(user.email, later(61_000));
    if (first !== second) {
      await expect(verifyPasswordResetOtp({ email: user.email, otp: first }, requestMeta)).rejects.toThrow(
        INVALID_OTP_MESSAGE,
      );
    }
    await expect(verifyPasswordResetOtp({ email: user.email, otp: second }, requestMeta)).resolves.toHaveProperty(
      "resetToken",
    );
  });

  it("rate limits repeated requests for one email", async () => {
    const user = await createTestUser("staff");
    for (let i = 0; i < 5; i++) await requestPasswordReset(user.email, { ...requestMeta, ipAddress: `198.51.100.${i}` });
    await expect(requestPasswordReset(user.email, { ...requestMeta, ipAddress: "198.51.100.9" })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});

describe("verifyPasswordResetOtp", () => {
  it("returns the same error for unknown emails, wrong codes and expired codes", async () => {
    const user = await createTestUser("staff");
    const otp = await requestCode(user.email);

    const attempts = [
      () => verifyPasswordResetOtp({ email: "nobody@example.com", otp }, requestMeta),
      () => verifyPasswordResetOtp({ email: user.email, otp: wrongCode(otp) }, requestMeta),
      () => verifyPasswordResetOtp({ email: user.email, otp }, requestMeta, later(5 * 60_000 + 1000)),
    ];
    for (const attempt of attempts) {
      const error = await attempt().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as Error).message).toBe(INVALID_OTP_MESSAGE);
    }
  });

  it("discards the code after too many wrong attempts", async () => {
    const user = await createTestUser("staff");
    const otp = await requestCode(user.email);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(verifyPasswordResetOtp({ email: user.email, otp: wrongCode(otp) }, requestMeta)).rejects.toThrow();
    }
    await expect(verifyPasswordResetOtp({ email: user.email, otp }, requestMeta)).rejects.toThrow(INVALID_OTP_MESSAGE);
    expect((await PasswordResetModel.findOne().lean())?.otpHash).toBeUndefined();
  });

  it("counts parallel guesses atomically", async () => {
    const user = await createTestUser("staff");
    const otp = await requestCode(user.email);
    await Promise.allSettled(
      Array.from({ length: 12 }, () => verifyPasswordResetOtp({ email: user.email, otp: wrongCode(otp) }, requestMeta)),
    );
    const record = await PasswordResetModel.findOne().lean();
    expect(record?.attempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
    await expect(verifyPasswordResetOtp({ email: user.email, otp }, requestMeta)).rejects.toThrow(INVALID_OTP_MESSAGE);
  });

  it("accepts a correct code only once", async () => {
    const user = await createTestUser("staff");
    const otp = await requestCode(user.email);
    const { resetToken } = await verifyPasswordResetOtp({ email: user.email, otp }, requestMeta);
    expect(resetToken.length).toBeGreaterThanOrEqual(40);
    expect(JSON.stringify(await PasswordResetModel.findOne().lean())).not.toContain(resetToken);
    await expect(verifyPasswordResetOtp({ email: user.email, otp }, requestMeta)).rejects.toThrow(INVALID_OTP_MESSAGE);
  });
});

describe("completePasswordReset", () => {
  it("sets the new password, signs out every session and confirms by email", async () => {
    const user = await createTestUser("staff", { mustChangePassword: true });
    const { session } = await login({ email: user.email, password: user.password }, requestMeta);

    const otp = await requestCode(user.email);
    const { resetToken } = await verifyPasswordResetOtp({ email: user.email, otp }, requestMeta);
    await (await completePasswordReset({ email: user.email, resetToken, newPassword: NEW_PASSWORD }, requestMeta))();

    expect(await validateSessionToken(session.token)).toBeNull();
    await expect(login({ email: user.email, password: user.password }, requestMeta)).rejects.toThrow();
    const result = await login({ email: user.email, password: NEW_PASSWORD }, requestMeta);
    expect(result.mustChangePassword).toBe(false);

    expect(await PasswordResetModel.countDocuments()).toBe(0);
    expect(sent.at(-1)?.subject).toBe("Your password was changed");
    expect(await EmailLogModel.exists({ template: "password_reset_done", status: "sent" })).not.toBeNull();
    expect(await ActivityLogModel.exists({ action: "auth.password_reset", sensitive: true })).not.toBeNull();
  });

  it("rejects a reused, expired or mismatched reset token", async () => {
    const user = await createTestUser("staff");
    const other = await createTestUser("staff");

    const otp = await requestCode(user.email);
    const { resetToken } = await verifyPasswordResetOtp({ email: user.email, otp }, requestMeta);
    await expect(
      completePasswordReset({ email: user.email, resetToken, newPassword: NEW_PASSWORD }, requestMeta, later(11 * 60_000)),
    ).rejects.toBeInstanceOf(BadRequestError);

    const otp2 = await requestCode(user.email, later(61_000));
    const second = await verifyPasswordResetOtp({ email: user.email, otp: otp2 }, requestMeta);
    await expect(
      completePasswordReset({ email: other.email, resetToken: second.resetToken, newPassword: NEW_PASSWORD }, requestMeta),
    ).rejects.toBeInstanceOf(BadRequestError);
    // A failed attempt consumes the token too.
    await expect(
      completePasswordReset({ email: user.email, resetToken: second.resetToken, newPassword: NEW_PASSWORD }, requestMeta),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(login({ email: other.email, password: NEW_PASSWORD }, requestMeta)).rejects.toThrow();
  });
});

describe("password reset emails", () => {
  it("renders the code and escapes the recipient name", () => {
    const email = passwordResetOtpEmail({
      companyName: "Ruthra Digital Solutions",
      recipientName: "<b>Ravi</b>",
      otp: "042917",
      validMinutes: 5,
    });
    expect(email.html).toContain("042917");
    expect(email.html).not.toContain("<b>Ravi</b>");
    expect(email.text).toContain("Code: 042917");
    expect(email.text).toContain("5 minutes");
  });
});
