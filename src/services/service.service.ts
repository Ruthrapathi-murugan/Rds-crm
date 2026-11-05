import "server-only";
import { Types } from "mongoose";
import {
  PRICING_UNIT_LABELS,
  SERVICE_CATEGORY_LABELS,
  type PricingUnit,
  type ServiceCategory,
} from "@/lib/constants";
import { BadRequestError, ConflictError, isDuplicateKeyError, NotFoundError } from "@/lib/errors";
import { escapeRegex } from "@/lib/list-params";
import { connectToDatabase } from "@/lib/mongodb";
import { slugify } from "@/lib/service-catalogue";
import { formatBasisPoints, formatINR } from "@/lib/utils/money";
import type { ServiceFormData } from "@/lib/validations/service";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { ServiceModel, type ServiceDoc } from "@/models/service";
import type { Option, SessionUser } from "@/types";
import { logActivity } from "./activity.service";
import { getCompanySettings } from "./settings.service";
import { toObjectId } from "./scope";

export type ServiceOption = Option & {
  category: ServiceCategory;
  basePricePaise: number;
  pricingUnit: PricingUnit;
  sacCode: string;
  defaultTaxRateBps: number | null;
};

/** Active services for pickers, grouped by category order then catalogue order. */
export async function serviceOptions(): Promise<ServiceOption[]> {
  await connectToDatabase();
  const services = await ServiceModel.find({ isActive: true }).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  return services.map((s) => ({
    value: s._id.toString(),
    label: s.name,
    description: [
      SERVICE_CATEGORY_LABELS[s.category as ServiceCategory],
      s.basePricePaise ? `${formatINR(s.basePricePaise)} ${PRICING_UNIT_LABELS[s.pricingUnit as PricingUnit].toLowerCase()}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    category: s.category as ServiceCategory,
    basePricePaise: s.basePricePaise ?? 0,
    pricingUnit: s.pricingUnit as PricingUnit,
    sacCode: s.sacCode ?? "",
    defaultTaxRateBps: s.defaultTaxRateBps ?? null,
  }));
}

// ── Catalogue management ─────────────────────────────────────────────────

export type ServiceListFilters = {
  category?: ServiceCategory;
  status?: "active" | "inactive";
  q?: string;
};

export type ServiceItem = {
  id: string;
  name: string;
  slug: string;
  category: ServiceCategory;
  description: string;
  basePricePaise: number;
  pricingUnit: PricingUnit;
  sacCode: string;
  defaultTaxRateBps: number | null;
  isActive: boolean;
  sortOrder: number;
  /** Projects and leads that reference this service. */
  usage: { projects: number; leads: number; total: number };
  updatedAt: string;
};

function toItem(d: ServiceDoc, usage: ServiceItem["usage"]): ServiceItem {
  return {
    id: d._id.toString(),
    name: d.name,
    slug: d.slug,
    category: d.category as ServiceCategory,
    description: d.description ?? "",
    basePricePaise: d.basePricePaise ?? 0,
    pricingUnit: d.pricingUnit as PricingUnit,
    sacCode: d.sacCode ?? "",
    defaultTaxRateBps: d.defaultTaxRateBps ?? null,
    isActive: d.isActive !== false,
    sortOrder: d.sortOrder ?? 0,
    usage,
    updatedAt: d.updatedAt.toISOString(),
  };
}

async function usageCounts(ids: Types.ObjectId[]): Promise<Map<string, ServiceItem["usage"]>> {
  const result = new Map<string, ServiceItem["usage"]>();
  if (ids.length === 0) return result;
  const [projects, leads] = await Promise.all([
    ProjectModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { service: { $in: ids } } },
      { $group: { _id: "$service", count: { $sum: 1 } } },
    ]),
    LeadModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { interestedService: { $in: ids } } },
      { $group: { _id: "$interestedService", count: { $sum: 1 } } },
    ]),
  ]);
  for (const id of ids) result.set(id.toString(), { projects: 0, leads: 0, total: 0 });
  for (const row of projects) {
    const entry = result.get(row._id.toString());
    if (entry) entry.projects = row.count;
  }
  for (const row of leads) {
    const entry = result.get(row._id.toString());
    if (entry) entry.leads = row.count;
  }
  for (const entry of result.values()) entry.total = entry.projects + entry.leads;
  return result;
}

/** The full catalogue (active and inactive) in display order. */
export async function listServices(filters: ServiceListFilters = {}): Promise<ServiceItem[]> {
  await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (filters.category) filter.category = filters.category;
  if (filters.status) filter.isActive = filters.status === "active";
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: re }, { description: re }, { sacCode: re }];
  }
  const docs = (await ServiceModel.find(filter).sort({ category: 1, sortOrder: 1, name: 1 }).lean()) as ServiceDoc[];
  const usage = await usageCounts(docs.map((d) => d._id));
  return docs.map((d) => toItem(d, usage.get(d._id.toString()) ?? { projects: 0, leads: 0, total: 0 }));
}

export async function getService(id: string): Promise<ServiceItem | null> {
  await connectToDatabase();
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const doc = (await ServiceModel.findById(id).lean()) as ServiceDoc | null;
  if (!doc) return null;
  const usage = await usageCounts([doc._id]);
  return toItem(doc, usage.get(doc._id.toString()) ?? { projects: 0, leads: 0, total: 0 });
}

/** "website-maintenance", then "website-maintenance-2", "-3"… on collision. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 150) || "service";
  const pattern = new RegExp(`^${escapeRegex(base)}(?:-(\\d+))?$`);
  const taken = await ServiceModel.find({ slug: pattern }).select("slug").lean();
  if (taken.length === 0) return base;
  const used = new Set(taken.map((t) => t.slug));
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Default tax rates must be one of the company's active rates. A rate that
 * has since been deactivated may stay on a service that already uses it.
 */
async function assertTaxRateAllowed(rateBps: number | null, current?: number | null) {
  if (rateBps === null || rateBps === current) return;
  const { taxRates } = await getCompanySettings();
  if (!taxRates.some((t) => t.isActive && t.rateBps === rateBps)) {
    throw new BadRequestError("Choose one of the tax rates set up in Settings.", {
      defaultTaxRate: ["Choose one of the configured tax rates"],
    });
  }
}

function serviceFields(data: ServiceFormData) {
  return {
    name: data.name,
    category: data.category,
    description: data.description,
    basePricePaise: data.basePrice,
    pricingUnit: data.pricingUnit,
    sacCode: data.sacCode,
    defaultTaxRateBps: data.defaultTaxRate,
    isActive: data.isActive,
    sortOrder: data.sortOrder,
  };
}

function priceLabel(paise: number, unit: PricingUnit) {
  return `${formatINR(paise)} ${PRICING_UNIT_LABELS[unit].toLowerCase()}`;
}

function taxLabel(bps: number | null) {
  return bps === null ? "chosen per document" : formatBasisPoints(bps);
}

export async function createService(user: SessionUser, data: ServiceFormData) {
  await connectToDatabase();
  await assertTaxRateAllowed(data.defaultTaxRate);
  // Retry once if two services with the same name are created at the same moment.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const service = await ServiceModel.create({ ...serviceFields(data), slug: await uniqueSlug(data.name) });
      await logActivity({
        actor: user,
        action: "service.created",
        entityType: "service",
        entityId: service._id,
        entityLabel: service.name,
        message: `Added ${service.name} to the catalogue at ${priceLabel(data.basePrice, data.pricingUnit)}`,
        sensitive: true,
      });
      return { id: service._id.toString(), slug: service.slug };
    } catch (error) {
      if (isDuplicateKeyError(error) && attempt < 2) continue;
      if (isDuplicateKeyError(error)) throw new ConflictError("A service with this name already exists.");
      throw error;
    }
  }
}

export async function updateService(user: SessionUser, id: string, data: ServiceFormData) {
  await connectToDatabase();
  const service = await ServiceModel.findById(toObjectId(id, "Service"));
  if (!service) throw new NotFoundError("Service");
  await assertTaxRateAllowed(data.defaultTaxRate, service.defaultTaxRateBps ?? null);

  const before = {
    price: service.basePricePaise ?? 0,
    unit: service.pricingUnit as PricingUnit,
    tax: service.defaultTaxRateBps ?? null,
    active: service.isActive !== false,
  };
  // The slug stays stable so catalogue seeding never duplicates a renamed service.
  service.set(serviceFields(data));
  await service.save();

  const priceChanged = before.price !== data.basePrice || before.unit !== data.pricingUnit;
  const taxChanged = before.tax !== data.defaultTaxRate;
  const changes: string[] = [];
  if (priceChanged) {
    changes.push(`price from ${priceLabel(before.price, before.unit)} to ${priceLabel(data.basePrice, data.pricingUnit)}`);
  }
  if (taxChanged) changes.push(`default tax from ${taxLabel(before.tax)} to ${taxLabel(data.defaultTaxRate)}`);
  if (before.active !== data.isActive) changes.push(data.isActive ? "activated it" : "deactivated it");

  await logActivity({
    actor: user,
    action: "service.updated",
    entityType: "service",
    entityId: service._id,
    entityLabel: service.name,
    message: changes.length ? `Updated ${service.name}: ${changes.join("; ")}` : `Updated ${service.name}`,
    sensitive: priceChanged || taxChanged,
    meta: priceChanged ? { fromPaise: before.price, toPaise: data.basePrice } : undefined,
  });
  return { id: service._id.toString() };
}

/** Inactive services stay in the catalogue and on old records but disappear from pickers. */
export async function setServiceActive(user: SessionUser, id: string, isActive: boolean) {
  await connectToDatabase();
  const service = await ServiceModel.findById(toObjectId(id, "Service"));
  if (!service) throw new NotFoundError("Service");
  if ((service.isActive !== false) !== isActive) {
    service.isActive = isActive;
    await service.save();
    await logActivity({
      actor: user,
      action: isActive ? "service.activated" : "service.deactivated",
      entityType: "service",
      entityId: service._id,
      entityLabel: service.name,
      message: isActive ? `Activated ${service.name}` : `Deactivated ${service.name}`,
    });
  }
  return { id: service._id.toString(), isActive };
}
