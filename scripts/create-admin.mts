/**
 * Creates the first Super Admin (public registration is disabled, so this
 * server-side command is the only way to bootstrap an account).
 *
 *   npm run create-admin -- --email owner@example.com --name "Owner Name"
 *
 * A strong temporary password is generated and printed once; it must be
 * changed at first sign-in. Use --reset to issue a new temporary password
 * for an existing account (e.g. a locked-out owner).
 */
import { bootstrap, fail, parseArgs } from "./lib/bootstrap.mts";

const args = parseArgs();
const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
const name = typeof args.name === "string" ? args.name.trim() : "";

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail('Usage: npm run create-admin -- --email owner@example.com --name "Owner Name" [--reset]');
}

const { mongoose } = await bootstrap();
const { UserModel } = await import("../src/models/user.ts");
const { generateTemporaryPassword, hashPassword } = await import("../src/lib/auth/password.ts");
const { ActivityLogModel } = await import("../src/models/activity-log.ts");
const { SessionModel } = await import("../src/models/session.ts");

const temporaryPassword = generateTemporaryPassword();
const passwordHash = await hashPassword(temporaryPassword);
const existing = await UserModel.findOne({ email });

if (existing && !args.reset) {
  await mongoose.disconnect();
  fail(`A user with ${email} already exists. Re-run with --reset to issue a new temporary password.`);
}

if (existing) {
  existing.set({ passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), isActive: true, role: "super_admin" });
  await existing.save();
  await SessionModel.deleteMany({ user: existing._id });
} else {
  if (!name) {
    await mongoose.disconnect();
    fail('Please provide a name: --name "Owner Name"');
  }
  await UserModel.create({ name, email, role: "super_admin", passwordHash, mustChangePassword: true });
}

const user = await UserModel.findOne({ email }).lean();
await ActivityLogModel.create({
  action: existing ? "user.password_reset" : "user.created",
  entityType: "user",
  entityId: user?._id,
  entityLabel: user?.name,
  actorName: "Command line",
  message: existing ? `Reset Super Admin password for ${user?.name} from the command line` : `Created Super Admin ${user?.name} from the command line`,
  sensitive: true,
});
await mongoose.disconnect();

console.log(`
✓ Super Admin ${existing ? "password reset" : "created"}

  Email:              ${email}
  Temporary password: ${temporaryPassword}

This password is shown only once. Sign in and you will be asked to choose a new one.
`);
