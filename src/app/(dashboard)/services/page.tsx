import type { Metadata } from "next";
import { Suspense } from "react";
import { Globe, Hotel, Layers, Megaphone, type LucideIcon } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { CardsSkeleton } from "@/components/data-table/table-skeleton";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { ListBody, ListView } from "@/components/data-table/list-view";
import { NewServiceButton } from "@/components/services/new-service-button";
import { ServiceCardActions } from "@/components/services/service-card-actions";
import type { TaxRateChoice } from "@/components/services/service-form-sheet";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import {
  PRICING_UNIT_LABELS,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  optionsOf,
  type ServiceCategory,
} from "@/lib/constants";
import { enumParam, firstParam, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { formatBasisPoints, formatINR, paiseToInput } from "@/lib/utils/money";
import { taxRateToInput } from "@/lib/validations/service";
import { listServices, type ServiceItem } from "@/services/service.service";
import { getCompanySettings, type TaxRateOption } from "@/services/settings.service";

export const metadata: Metadata = { title: "Services" };

const CATEGORY_ICONS: Record<ServiceCategory, LucideIcon> = {
  web_development: Globe,
  hotel_management: Hotel,
  digital_marketing: Megaphone,
};

const CATEGORY_ACCENTS: Record<ServiceCategory, string> = {
  web_development: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  hotel_management: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  digital_marketing: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
};

/** Active rates for the picker, one entry per rate. */
function taxChoices(rates: TaxRateOption[]): TaxRateChoice[] {
  const seen = new Set<number>();
  const choices: TaxRateChoice[] = [];
  for (const rate of rates) {
    if (!rate.isActive || seen.has(rate.rateBps)) continue;
    seen.add(rate.rateBps);
    choices.push({ value: taxRateToInput(rate.rateBps), label: rate.label });
  }
  return choices;
}

function taxLabel(bps: number | null, rates: TaxRateOption[]) {
  if (bps === null) return "Tax chosen per document";
  return rates.find((r) => r.rateBps === bps)?.label ?? `Tax ${formatBasisPoints(bps)}`;
}

function usageLabel(usage: ServiceItem["usage"]) {
  if (usage.total === 0) return "Not used yet";
  const parts = [
    usage.projects ? `${usage.projects} project${usage.projects === 1 ? "" : "s"}` : "",
    usage.leads ? `${usage.leads} lead${usage.leads === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `Used by ${parts.join(" · ")}`;
}

async function HeaderActions() {
  const user = await requireUser();
  if (!hasPermission(user, "services:manage")) return null;
  const settings = await getCompanySettings();
  return <NewServiceButton taxRates={taxChoices(settings.taxRates)} />;
}

function ServiceCard({
  service,
  rates,
  choices,
  canManage,
}: {
  service: ServiceItem;
  rates: TaxRateOption[];
  choices: TaxRateChoice[];
  canManage: boolean;
}) {
  return (
    <Card className={cn("hover-lift relative h-full gap-4 p-5", !service.isActive && "bg-muted/40 shadow-none")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={cn("leading-snug font-semibold", !service.isActive && "text-muted-foreground")}>{service.name}</h3>
        <StatusBadge tone={service.isActive ? "success" : "muted"}>{service.isActive ? "Active" : "Inactive"}</StatusBadge>
      </div>
      <p className="text-muted-foreground line-clamp-3 text-sm text-pretty">
        {service.description || "No description yet."}
      </p>
      <div className="mt-auto flex flex-col gap-3">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          {service.basePricePaise ? (
            <>
              <span className={cn("text-xl font-semibold tracking-tight tabular-nums", !service.isActive && "text-muted-foreground")}>
                {formatINR(service.basePricePaise)}
              </span>
              <span className="text-muted-foreground text-sm">{PRICING_UNIT_LABELS[service.pricingUnit].toLowerCase()}</span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground text-base font-medium">Price not set</span>
              <span className="text-muted-foreground text-sm">· {PRICING_UNIT_LABELS[service.pricingUnit].toLowerCase()}</span>
            </>
          )}
        </p>
        <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex flex-col">
            <dt className="font-medium tracking-wide uppercase">SAC</dt>
            <dd className="text-foreground font-mono text-sm">{service.sacCode || "—"}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="font-medium tracking-wide uppercase">Default tax</dt>
            <dd className="text-foreground text-sm">{taxLabel(service.defaultTaxRateBps, rates)}</dd>
          </div>
        </dl>
        <div className="flex min-h-8 items-center justify-between gap-2 border-t pt-3">
          <span className="text-muted-foreground text-xs">{usageLabel(service.usage)}</span>
          {canManage && (
            <ServiceCardActions
              service={{ id: service.id, name: service.name, isActive: service.isActive, usage: service.usage.total }}
              taxRates={choices}
              formValues={{
                name: service.name,
                category: service.category,
                description: service.description,
                basePrice: paiseToInput(service.basePricePaise),
                pricingUnit: service.pricingUnit,
                sacCode: service.sacCode,
                defaultTaxRate: taxRateToInput(service.defaultTaxRateBps),
                isActive: service.isActive,
                sortOrder: String(service.sortOrder),
              }}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

async function ServiceCatalogue({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "services:read")) return <AccessDenied />;

  const sp = await searchParams;
  const filters = {
    category: enumParam(sp, "category", SERVICE_CATEGORIES),
    status: enumParam(sp, "status", ["active", "inactive"] as const),
    q: (firstParam(sp, "q") ?? "").trim().slice(0, 100),
  };
  const [services, settings] = await Promise.all([listServices(filters), getCompanySettings()]);
  const canManage = hasPermission(user, "services:manage");
  const choices = taxChoices(settings.taxRates);
  const hasFilters = Boolean(filters.q || filters.category || filters.status);
  const groups = SERVICE_CATEGORIES.map((category) => ({
    category,
    services: services.filter((s) => s.category === category),
  })).filter((g) => g.services.length > 0);

  return (
    <ListView>
      <ListToolbar
        searchPlaceholder="Search services or SAC codes…"
        filters={[
          { key: "category", label: "Categories", options: optionsOf(SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS) },
          {
            key: "status",
            label: "Statuses",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
        ]}
      />
      <ListBody className="flex flex-col gap-8">
        {groups.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={Layers}
              title={hasFilters ? "No services match your filters" : "The catalogue is empty"}
              description={
                hasFilters
                  ? "Try a different search or clear the filters."
                  : canManage
                    ? "Add the services you sell so they can be picked on leads, projects and documents."
                    : "An administrator has not added any services yet."
              }
            />
          </Card>
        ) : (
          groups.map(({ category, services: items }) => {
            const Icon = CATEGORY_ICONS[category];
            const active = items.filter((s) => s.isActive).length;
            return (
              <section key={category} aria-labelledby={`category-${category}`} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", CATEGORY_ACCENTS[category])}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <h2 id={`category-${category}`} className="text-lg font-semibold tracking-tight">
                      {SERVICE_CATEGORY_LABELS[category]}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {items.length} service{items.length === 1 ? "" : "s"}
                      {active !== items.length && ` · ${active} active`}
                    </p>
                  </div>
                </div>
                <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((service) => (
                    <ServiceCard key={service.id} service={service} rates={settings.taxRates} choices={choices} canManage={canManage} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </ListBody>
    </ListView>
  );
}

export default function ServicesPage(props: PageProps<"/services">) {
  return (
    <>
      <PageHeader
        title="Services"
        description="Your catalogue of services, prices and tax defaults."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<CardsSkeleton count={6} />}>
        <ServiceCatalogue searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
