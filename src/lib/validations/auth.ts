import { z } from "zod";
import { ROLES } from "@/lib/constants";
import { optionalPhone, requiredText } from "./common";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase().max(200),
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
  email: z.email("Enter a valid email address").trim().toLowerCase().max(200),
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
