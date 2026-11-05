import { beforeEach, describe, expect, it } from "vitest";
import { companySettingsSchema } from "@/lib/validations/settings";
import { ActivityLogModel } from "@/models/activity-log";
import { listAuditLog, logActivity } from "@/services/activity.service";
import { DEFAULT_SETTINGS, getCompanySettings, updateCompanySettings } from "@/services/settings.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

function settingsInput(overrides: Record<string, unknown> = {}) {
  return {
    companyName: "Ruthra Digital Solutions",
    city: "Palani",
    state: "Tamil Nadu",
    gstRegistered: false,
    gstin: "",
    invoicePrefix: "RDS",
    quotationPrefix: "RDSQ",
    defaultPaymentTermsDays: "15",
    defaultQuotationValidityDays: "30",
    taxRates: [
      { label: "Nil", rate: "0", isActive: true },
      { label: "GST 18%", rate: "18", isActive: true },
      { label: "Old 2.5%", rate: "2.5", isActive: false },
    ],
    ...overrides,
  };
}

const auditParams = { page: 1, pageSize: 20, q: "", sort: "createdAt", dir: "desc" as const };

describe("company settings validation", () => {
  it("requires a GSTIN and state when GST registered", () => {
    const result = companySettingsSchema.safeParse(settingsInput({ gstRegistered: true, state: "" }));
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("gstin");
    expect(paths).toContain("state");

    const ok = companySettingsSchema.safeParse(settingsInput({ gstRegistered: true, gstin: "33abcde1234f1z5" }));
    expect(ok.success).toBe(true);
    expect(ok.data!.gstin).toBe("33ABCDE1234F1Z5");
  });

  it("rejects an invalid GSTIN even when not registered", () => {
    expect(companySettingsSchema.safeParse(settingsInput({ gstin: "12345" })).success).toBe(false);
  });

  it("validates document prefixes", () => {
    for (const prefix of ["", "TOOLONG", "RD/S", "R-S", "R S"]) {
      expect(companySettingsSchema.safeParse(settingsInput({ invoicePrefix: prefix })).success, prefix).toBe(false);
    }
    for (const prefix of ["R", "RDS", "INV26", "abc"]) {
      expect(companySettingsSchema.safeParse(settingsInput({ quotationPrefix: prefix })).success, prefix).toBe(true);
    }
  });

  it("validates tax rates, PIN, IFSC and UPI", () => {
    const bad = (overrides: Record<string, unknown>) => companySettingsSchema.safeParse(settingsInput(overrides)).success;
    expect(bad({ taxRates: [{ label: "Too much", rate: "101", isActive: true }] })).toBe(false);
    expect(bad({ taxRates: [{ label: "", rate: "5", isActive: true }] })).toBe(false);
    expect(bad({ taxRates: [{ label: "Bad", rate: "1.234", isActive: true }] })).toBe(false);
    expect(bad({ pincode: "6246" })).toBe(false);
    expect(bad({ bankIfsc: "SBIN1234567" })).toBe(false);
    expect(bad({ upiId: "not-a-upi" })).toBe(false);
  });

  it("strips unknown keys", () => {
    const parsed = companySettingsSchema.parse({ ...settingsInput(), key: "hacked", _id: "x" });
    expect(parsed).not.toHaveProperty("key");
    expect(parsed).not.toHaveProperty("_id");
  });
});

describe("company settings persistence", () => {
  it("returns defaults before the first save", async () => {
    const settings = await getCompanySettings();
    expect(settings.companyName).toBe(DEFAULT_SETTINGS.companyName);
    expect(settings.taxRates.map((t) => t.rateBps)).toEqual(DEFAULT_SETTINGS.taxRates.map((t) => t.rateBps));
  });

  it("stores tax rates as integer basis points and keeps their ids on update", async () => {
    const admin = await createTestUser("admin");
    const saved = await updateCompanySettings(admin, companySettingsSchema.parse(settingsInput()));
    expect(saved.taxRates.map((t) => [t.label, t.rateBps, t.isActive])).toEqual([
      ["Nil", 0, true],
      ["GST 18%", 1800, true],
      ["Old 2.5%", 250, false],
    ]);
    expect(saved.taxRates.every((t) => /^[a-f0-9]{24}$/.test(t.id))).toBe(true);

    const gstId = saved.taxRates[1].id;
    const again = await updateCompanySettings(
      admin,
      companySettingsSchema.parse(
        settingsInput({
          taxRates: [
            { id: gstId, label: "GST 18% (services)", rate: "18", isActive: true },
            { label: "GST 5%", rate: "5", isActive: true },
          ],
        }),
      ),
    );
    expect(again.taxRates).toHaveLength(2);
    expect(again.taxRates[0]).toMatchObject({ id: gstId, label: "GST 18% (services)", rateBps: 1800 });
    expect(again.taxRates[1].rateBps).toBe(500);

    const reloaded = await getCompanySettings();
    expect(reloaded.taxRates.map((t) => t.rateBps)).toEqual([1800, 500]);
  });

  it("logs GST, numbering and tax-rate changes as sensitive audit events", async () => {
    const admin = await createTestUser("admin");
    await updateCompanySettings(admin, companySettingsSchema.parse(settingsInput()));
    await updateCompanySettings(
      admin,
      companySettingsSchema.parse(settingsInput({ gstRegistered: true, gstin: "33ABCDE1234F1Z5", invoicePrefix: "INV" })),
    );
    const last = await ActivityLogModel.findOne({ action: "settings.updated" }).sort({ createdAt: -1, _id: -1 }).lean();
    expect(last?.sensitive).toBe(true);
    expect(last?.message).toContain("GST registration");
    expect(last?.message).toContain("document numbering");
  });
});

describe("audit log", () => {
  it("lists sensitive events by default and filters by actor, event group, dates and search", async () => {
    const owner = await createTestUser("super_admin");
    const admin = await createTestUser("admin");

    await logActivity({ actor: owner, action: "auth.login", entityType: "auth", message: "Owner signed in", sensitive: true, ipAddress: "203.0.113.5" });
    await logActivity({ actor: admin, action: "user.created", entityType: "user", entityLabel: "New Staff", message: "Created Staff account", sensitive: true });
    await logActivity({ actor: admin, action: "lead.created", entityType: "lead", message: "Created lead LD-00001" });
    await logActivity({ actor: owner, action: "settings.updated", entityType: "settings", message: "Updated company settings (tax rates)", sensitive: true });
    // An older event on 1 Oct 2026 (IST).
    await ActivityLogModel.create({
      actor: owner.id,
      actorName: owner.name,
      action: "invoice.issued",
      entityType: "invoice",
      message: "Issued RDS/26-27/0001",
      sensitive: true,
      createdAt: new Date("2026-10-01T10:00:00+05:30"),
    });

    const all = await listAuditLog(auditParams);
    expect(all.total).toBe(4);
    expect(all.rows.some((r) => r.action === "lead.created")).toBe(false);
    expect(all.rows.find((r) => r.action === "auth.login")?.ipAddress).toBe("203.0.113.5");

    const withRoutine = await listAuditLog(auditParams, { sensitiveOnly: false });
    expect(withRoutine.total).toBe(5);

    const byActor = await listAuditLog(auditParams, { actor: admin.id });
    expect(byActor.rows.map((r) => r.action)).toEqual(["user.created"]);

    const byGroup = await listAuditLog(auditParams, { action: "auth" });
    expect(byGroup.rows.map((r) => r.action)).toEqual(["auth.login"]);
    const byExact = await listAuditLog(auditParams, { action: "settings.updated" });
    expect(byExact.total).toBe(1);
    // A prefix must not match other groups that merely start with the same letters.
    expect((await listAuditLog(auditParams, { action: "use" })).total).toBe(0);

    const october1 = await listAuditLog(auditParams, { from: "2026-10-01", to: "2026-10-01" });
    expect(october1.rows.map((r) => r.action)).toEqual(["invoice.issued"]);
    const sinceOct2 = await listAuditLog(auditParams, { from: "2026-10-02" });
    expect(sinceOct2.rows.some((r) => r.action === "invoice.issued")).toBe(false);

    const search = await listAuditLog({ ...auditParams, q: "tax rates" });
    expect(search.rows.map((r) => r.action)).toEqual(["settings.updated"]);

    const paged = await listAuditLog({ ...auditParams, pageSize: 2, page: 2 });
    expect(paged.rows).toHaveLength(2);
    expect(paged.pageCount).toBe(2);
  });
});
