import { z } from "zod";
import { ROLES } from "@/lib/constants";
import { optionalPhone, requiredText } from "./common";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

/** Trims and lower-cases before validating, so pasted addresses with stray spaces are accepted. */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, "Use at most 200 characters")
  .pipe(z.email("Enter a valid email address"));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX),
});
export type LoginInput = z.input<typeof loginSchema>;

export const newPasswordField = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one",
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const createUserSchema = z.object({
  name: requiredText("Name", 120),
  email: emailField,
  phone: optionalPhone,
  role: z.enum(ROLES),
});
export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUserData = z.output<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: requiredText("Name", 120),
  phone: optionalPhone,
  role: z.enum(ROLES),
  isActive: z.boolean(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type UpdateUserData = z.output<typeof updateUserSchema>;

// ── Forgot password (email OTP) ──────────────────────────────────────────

export const forgotPasswordSchema = z.object({ email: emailField });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const verifyOtpSchema = z.object({
  email: emailField,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
});
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

/** The two password fields shown on the last step of the reset form. */
export const newPasswordPairSchema = z
  .object({ newPassword: newPasswordField, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type NewPasswordPairInput = z.input<typeof newPasswordPairSchema>;

export const resetPasswordSchema = z
  .object({
    email: emailField,
    resetToken: z.string().min(20).max(100),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
