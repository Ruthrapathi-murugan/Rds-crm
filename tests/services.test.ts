import { beforeEach, describe, expect, it } from "vitest";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { serviceFormSchema, taxRateToInput } from "@/lib/validations/service";
import { ActivityLogModel } from "@/models/activity-log";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { ServiceModel } from "@/models/service";
import {
  createService,
  getService,
  listServices,
  serviceOptions,
  setServiceActive,
  updateService,
} from "@/services/service.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

function serviceInput(overrides: Record<string, unknown> = {}) {
  return serviceFormSchema.parse({
    name: "Business Website",
    category: "web_development",
    description: "Responsive website",
    basePrice: "24,999.50",
    pricingUnit: "one_time",
    sacCode: "998314",
    defaultTaxRate: "18",
    isActive: true,
    sortOrder: "3",
    ...overrides,
  });
}

describe("service validation", () => {
  it("converts price to paise and tax percent to basis points", () => {
    const data = serviceInput();
    expect(data.basePrice).toBe(2_499_950);
    expect(data.defaultTaxRate).toBe(1800);
    expect(data.sortOrder).toBe(3);
    expect(serviceInput({ defaultTaxRate: "" }).defaultTaxRate).toBeNull();
    expect(serviceInput({ defaultTaxRate: "2.5" }).defaultTaxRate).toBe(250);
    expect(taxRateToInput(250)).toBe("2.5");
    expect(taxRateToInput(1800)).toBe("18");
    expect(taxRateToInput(null)).toBe("");
  });

  it("rejects bad SAC codes, rates and sort orders", () => {
    const base = { ...serviceInput(), basePrice: "1", defaultTaxRate: "18", sortOrder: "1" };
    expect(serviceFormSchema.safeParse({ ...base, sacCode: "123" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, sacCode: "12a456" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, defaultTaxRate: "120" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, sortOrder: "1001" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, sortOrder: "1.5" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, basePrice: "-5" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, category: "plumbing" }).success).toBe(false);
  });
});

describe("service catalogue", () => {
  it("stores price in paise and appends -2, -3 to colliding slugs", async () => {
    const admin = await createTestUser("admin");
    const a = await createService(admin, serviceInput());
    const b = await createService(admin, serviceInput());
    const c = await createService(admin, serviceInput({ name: "Business  Website!" }));
    expect([a.slug, b.slug, c.slug]).toEqual(["business-website", "business-website-2", "business-website-3"]);
    const doc = await ServiceModel.findById(a.id).lean();
    expect(doc?.basePricePaise).toBe(2_499_950);
    expect(Number.isInteger(doc?.basePricePaise)).toBe(true);
    expect(doc?.defaultTaxRateBps).toBe(1800);
  });

  it("keeps the slug stable on rename and logs price changes as sensitive", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createService(admin, serviceInput());
    await updateService(admin, id, serviceInput({ name: "Business Website Pro", basePrice: "30000" }));
    const doc = await ServiceModel.findById(id).lean();
    expect(doc).toMatchObject({ name: "Business Website Pro", slug: "business-website", basePricePaise: 3_000_000 });
    const log = await ActivityLogModel.findOne({ action: "service.updated" }).lean();
    expect(log?.sensitive).toBe(true);
    expect(log?.message).toContain("₹30,000.00");

    await updateService(admin, id, serviceInput({ name: "Business Website Pro", basePrice: "30000", description: "New copy" }));
    const latest = await ActivityLogModel.findOne({ action: "service.updated" }).sort({ createdAt: -1, _id: -1 }).lean();
    expect(latest?.sensitive).toBe(false);
  });

  it("only accepts tax rates configured in settings", async () => {
    const admin = await createTestUser("admin");
    await expect(createService(admin, serviceInput({ defaultTaxRate: "12" }))).rejects.toThrow(BadRequestError);
    const ok = await createService(admin, serviceInput({ defaultTaxRate: "" }));
    expect((await getService(ok.id))?.defaultTaxRateBps).toBeNull();
  });

  it("deactivating hides a service from options but keeps it listed", async () => {
    const admin = await createTestUser("admin");
    const { id } = await createService(admin, serviceInput());
    await createService(admin, serviceInput({ name: "SEO", category: "digital_marketing", pricingUnit: "monthly" }));
    expect((await serviceOptions()).map((o) => o.label)).toContain("Business Website");

    await setServiceActive(admin, id, false);
    expect((await serviceOptions()).map((o) => o.label)).toEqual(["SEO"]);
    expect(await listServices()).toHaveLength(2);
    expect((await listServices({ status: "inactive" })).map((s) => s.name)).toEqual(["Business Website"]);
    expect((await listServices({ status: "active" })).map((s) => s.name)).toEqual(["SEO"]);

    await setServiceActive(admin, id, true);
    expect(await serviceOptions()).toHaveLength(2);
    expect(await ActivityLogModel.countDocuments({ action: { $in: ["service.activated", "service.deactivated"] } })).toBe(2);
  });

  it("filters by category and search, and counts usage", async () => {
    const admin = await createTestUser("admin");
    const web = await createService(admin, serviceInput());
    await createService(admin, serviceInput({ name: "Google Ads", category: "digital_marketing", sacCode: "998365" }));
    await ProjectModel.create({
      projectNumber: "PRJ-1",
      name: "Site",
      customer: admin.id,
      service: web.id,
      category: "web_development",
      createdBy: admin.id,
    });
    await LeadModel.create({ leadNumber: "LD-1", contactName: "A", phone: "9876543210", source: "website", interestedService: web.id, createdBy: admin.id });
    await LeadModel.create({ leadNumber: "LD-2", contactName: "B", phone: "9876543211", source: "website", interestedService: web.id, createdBy: admin.id });

    expect((await listServices({ category: "digital_marketing" })).map((s) => s.name)).toEqual(["Google Ads"]);
    expect((await listServices({ q: "998365" })).map((s) => s.name)).toEqual(["Google Ads"]);
    expect(await listServices({ q: "(" })).toHaveLength(0);
    expect((await getService(web.id))?.usage).toEqual({ projects: 1, leads: 2, total: 3 });
  });

  it("service functions work for any caller; permissions are enforced by the API layer", async () => {
    const staff = await createTestUser("staff");
    const { id } = await createService(staff, serviceInput());
    await setServiceActive(staff, id, false);
    expect((await getService(id))?.isActive).toBe(false);
  });

  it("reports unknown services", async () => {
    const admin = await createTestUser("admin");
    expect(await getService("nope")).toBeNull();
    await expect(setServiceActive(admin, "64b7f0c2a1b2c3d4e5f60789", false)).rejects.toThrow(NotFoundError);
  });
});
