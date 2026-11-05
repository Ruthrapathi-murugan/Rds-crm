import mongoose from "mongoose";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/constants";
import { connectToDatabase } from "@/lib/mongodb";
import { permissionsFor } from "@/lib/permissions";
import * as models from "@/models";
import { UserModel } from "@/models/user";
import type { SessionUser } from "@/types";

/** Connects, builds every index (unique constraints matter in tests) and empties all collections. */
export async function resetDatabase() {
  await connectToDatabase();
  await Promise.all(Object.values(models).map((model) => model.syncIndexes()));
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

let userCounter = 0;

export async function createTestUser(
  role: Role = "admin",
  overrides: { password?: string; isActive?: boolean; mustChangePassword?: boolean } = {},
): Promise<SessionUser & { password: string }> {
  userCounter += 1;
  const password = overrides.password ?? "correct-horse-42";
  const user = await UserModel.create({
    name: `Test ${role} ${userCounter}`,
    email: `user${userCounter}.${role}@example.com`,
    role,
    passwordHash: await hashPassword(password),
    isActive: overrides.isActive ?? true,
    mustChangePassword: overrides.mustChangePassword ?? false,
  });
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role,
    permissions: permissionsFor(role),
    mustChangePassword: Boolean(user.mustChangePassword),
    password,
  };
}

export const requestMeta = { ipAddress: "203.0.113.10", userAgent: "vitest" };
