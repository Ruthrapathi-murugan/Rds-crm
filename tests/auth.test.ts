import { beforeEach, describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_ABSOLUTE_TTL_MS } from "@/lib/auth/constants";
import { createSession, hashSessionToken, validateSessionToken } from "@/lib/auth/session";
import { BadRequestError, ForbiddenError, RateLimitError, UnauthorizedError } from "@/lib/errors";
import { canManageRole, hasPermission, permissionsFor } from "@/lib/permissions";
import { ActivityLogModel } from "@/models/activity-log";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";
import { changePassword, login } from "@/services/auth.service";
import { createUser, resetUserPassword, updateUser } from "@/services/user.service";
import { createTestUser, requestMeta, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(await verifyPassword("s3cret-password", "garbage")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("generates strong temporary passwords", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{4}$/);
    expect(generateTemporaryPassword()).not.toBe(pw);
  });
});

describe("login", () => {
  it("opens a database-backed session for valid credentials", async () => {
    const user = await createTestUser("staff");
    const { session } = await login({ email: user.email, password: user.password }, requestMeta);

    const validated = await validateSessionToken(session.token);
    expect(validated?.user._id.toString()).toBe(user.id);
    // Only a hash of the token is stored.
    expect(await SessionModel.exists({ tokenHash: session.token })).toBeNull();
    expect(await ActivityLogModel.exists({ action: "auth.login", sensitive: true })).not.toBeNull();
  });

  it("returns the same generic error for a wrong password, unknown email and inactive account", async () => {
    const user = await createTestUser("staff");
    const inactive = await createTestUser("staff", { isActive: false });
    const attempts = [
      { email: user.email, password: "nope-nope-1" },
      { email: "nobody@example.com", password: "whatever-1" },
      { email: inactive.email, password: inactive.password },
    ];
    for (const credentials of attempts) {
      const error = await login(credentials, requestMeta).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as Error).message).toBe("Invalid email or password.");
    }
    expect(await ActivityLogModel.countDocuments({ action: "auth.login_failed" })).toBe(3);
  });

  it("rate limits repeated attempts for the same email and IP", async () => {
    const user = await createTestUser("staff");
    for (let i = 0; i < 8; i++) {
      await expect(login({ email: user.email, password: "wrong-pass-1" }, requestMeta)).rejects.toThrow(
        UnauthorizedError,
      );
    }
    // Even the correct password is refused once the limit is hit.
    await expect(login({ email: user.email, password: user.password }, requestMeta)).rejects.toThrow(RateLimitError);
    // A different IP is not affected by this email+IP counter.
    await expect(
      login({ email: user.email, password: user.password }, { ...requestMeta, ipAddress: "198.51.100.7" }),
    ).resolves.toBeTruthy();
  });
});

describe("session validation", () => {
  it("rejects unknown, expired and over-age sessions", async () => {
    const user = await createTestUser("staff");
    expect(await validateSessionToken("not-a-real-token")).toBeNull();

    const { token } = await createSession(user.id, requestMeta);
    const afterIdle = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await validateSessionToken(token, afterIdle)).toBeNull();

    const fresh = await createSession(user.id, requestMeta);
    await SessionModel.updateOne(
      { tokenHash: hashSessionToken(fresh.token) },
      { expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS * 2) },
    );
    const pastAbsolute = new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS + 1000);
    expect(await validateSessionToken(fresh.token, pastAbsolute)).toBeNull();
  });

  it("ends sessions when the user is deactivated", async () => {
    const user = await createTestUser("staff");
    const { token } = await createSession(user.id, requestMeta);
    await UserModel.updateOne({ _id: user.id }, { isActive: false });
    expect(await validateSessionToken(token)).toBeNull();
  });
});

describe("password change", () => {
  it("signs out other sessions and keeps the new one valid", async () => {
    const user = await createTestUser("staff");
    const other = await createSession(user.id, requestMeta);

    const newSession = await changePassword(
      user,
      { currentPassword: user.password, newPassword: "brand-new-pass-9" },
      requestMeta,
    );
    expect(await validateSessionToken(other.token)).toBeNull();
    expect(await validateSessionToken(newSession.token)).not.toBeNull();
    await expect(login({ email: user.email, password: "brand-new-pass-9" }, requestMeta)).resolves.toBeTruthy();
  });

  it("requires the current password", async () => {
    const user = await createTestUser("staff");
    await expect(
      changePassword(user, { currentPassword: "wrong-wrong-1", newPassword: "brand-new-pass-9" }, requestMeta),
    ).rejects.toThrow(BadRequestError);
  });
});

describe("permissions", () => {
  it("limits staff to their working modules", () => {
    const staff = { permissions: permissionsFor("staff") };
    expect(hasPermission(staff, "leads:write")).toBe(true);
    expect(hasPermission(staff, "records:all")).toBe(false);
    expect(hasPermission(staff, "invoices:read")).toBe(false);
    expect(hasPermission(staff, "payments:write")).toBe(false);
    expect(hasPermission(staff, "reports:read")).toBe(false);
    expect(hasPermission(staff, "users:manage")).toBe(false);
  });

  it("gives managers finance but not administration", () => {
    const manager = { permissions: permissionsFor("manager") };
    expect(hasPermission(manager, "payments:write")).toBe(true);
    expect(hasPermission(manager, "payments:void")).toBe(false);
    expect(hasPermission(manager, "settings:manage")).toBe(false);
    expect(hasPermission(manager, "users:manage")).toBe(false);
  });

  it("only lets users manage lower roles (Super Admin manages all)", () => {
    expect(canManageRole("super_admin", "super_admin")).toBe(true);
    expect(canManageRole("admin", "manager")).toBe(true);
    expect(canManageRole("admin", "admin")).toBe(false);
    expect(canManageRole("admin", "super_admin")).toBe(false);
    expect(canManageRole("manager", "staff")).toBe(false);
  });
});

describe("user administration", () => {
  it("creates accounts with a one-time temporary password", async () => {
    const admin = await createTestUser("admin");
    const { user, temporaryPassword } = await createUser(admin, {
      name: "New Staff",
      email: "new.staff@example.com",
      phone: "",
      role: "staff",
    });
    expect(user.mustChangePassword).toBe(true);
    const result = await login({ email: "new.staff@example.com", password: temporaryPassword }, requestMeta);
    expect(result.mustChangePassword).toBe(true);
  });

  it("stops admins from creating admins or super admins", async () => {
    const admin = await createTestUser("admin");
    await expect(
      createUser(admin, { name: "X", email: "x@example.com", phone: "", role: "super_admin" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("protects self-demotion and the last super admin", async () => {
    const superAdmin = await createTestUser("super_admin");
    await expect(
      updateUser(superAdmin, superAdmin.id, { name: "Me", phone: "", role: "staff", isActive: true }),
    ).rejects.toThrow(BadRequestError);

    const second = await createTestUser("super_admin");
    await updateUser(superAdmin, second.id, { name: "Second", phone: "", role: "admin", isActive: true });
    expect((await UserModel.findById(second.id).lean())?.role).toBe("admin");
  });

  it("revokes sessions on deactivation and password reset", async () => {
    const admin = await createTestUser("admin");
    const staff = await createTestUser("staff");
    const s1 = await createSession(staff.id, requestMeta);
    await resetUserPassword(admin, staff.id);
    expect(await validateSessionToken(s1.token)).toBeNull();

    const s2 = await createSession(staff.id, requestMeta);
    await updateUser(admin, staff.id, { name: staff.name, phone: "", role: "staff", isActive: false });
    expect(await validateSessionToken(s2.token)).toBeNull();
  });
});
