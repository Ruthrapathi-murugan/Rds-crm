import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  FileText,
  FolderKanban,
  IndianRupee,
  Layers,
  ListChecks,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  Receipt,
  Wallet,
  Hourglass,
} from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { CommunicationLog } from "@/components/common/communication-log";
import { DetailList } from "@/components/common/detail-list";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { CustomerDetailActions } from "@/components/customers/customer-detail-actions";
import {
  InvoicesTable,
  PaymentsTable,
  ProjectsTable,
  QuotationsTable,
  TasksTable,
} from "@/components/customers/customer-related-tables";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/current-user";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TYPE_LABELS, stateCodeOf } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { CUSTOMER_STATUS_TONES } from "@/lib/status-tones";
import { formatDate } from "@/lib/utils/date";
import { listEntityActivity } from "@/services/activity.service";
import { getCustomer } from "@/services/customer.service";

export const metadata: Metadata = { title: "Customer" };

function whatsappLink(number: string) {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function TabCount({ value }: { value: number }) {
  return (
    <span className="bg-muted text-muted-foreground group-data-[state=active]/tab:bg-primary/10 group-data-[state=active]/tab:text-primary rounded-full px-1.5 text-xs tabular-nums">
      {value}
    </span>
  );
}

async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "customers:read")) return <AccessDenied />;
  const { id } = await params;
  const customer = await getCustomer(user, id);
  if (!customer) notFound();
  const activity = await listEntityActivity("customer", customer.id);
  const now = new Date();

  const title = customer.businessName || customer.name;
  const canWrite = hasPermission(user, "customers:write");
  const canNewQuotation = hasPermission(user, "quotations:write") && !customer.archived;
  const canNewInvoice = hasPermission(user, "invoices:write") && !customer.archived;
  const stateCode = stateCodeOf(customer.state);
  const fullAddress = [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ");
  const openTasks = customer.tasks?.filter((t) => t.status === "todo" || t.status === "in_progress").length ?? 0;

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "projects", label: "Projects", count: customer.projects.length, show: hasPermission(user, "projects:read") },
    { value: "quotations", label: "Quotations", count: customer.quotations?.length, show: customer.quotations !== null },
    { value: "invoices", label: "Invoices", count: customer.invoices?.length, show: customer.invoices !== null },
    { value: "payments", label: "Payments", count: customer.payments?.length, show: customer.payments !== null },
    { value: "tasks", label: "Tasks", count: customer.tasks?.length, show: customer.tasks !== null },
    { value: "communications", label: "Communications", count: customer.communications.length },
    { value: "activity", label: "Activity" },
  ].filter((t) => t.show !== false);

  return (
    <>
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title}
            <EnumBadge value={customer.status} labels={CUSTOMER_STATUS_LABELS} tones={CUSTOMER_STATUS_TONES} />
            <StatusBadge tone="primary">{CUSTOMER_TYPE_LABELS[customer.type]}</StatusBadge>
            {customer.archived && <StatusBadge tone="muted">Archived</StatusBadge>}
          </span>
        }
        description={[
          customer.customerNumber,
          customer.businessName ? customer.name : null,
          customer.city,
          `Customer since ${formatDate(customer.createdAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <CustomerDetailActions
            customer={{ id: customer.id, name: title, archived: customer.archived }}
            formValues={{
              name: customer.name,
              businessName: customer.businessName,
              phone: customer.phone,
              whatsapp: customer.whatsapp,
              email: customer.email,
              address: customer.address,
              city: customer.city,
              state: customer.state,
              pincode: customer.pincode,
              gstin: customer.gstin,
              type: customer.type,
              status: customer.status,
              servicesPurchased: customer.services.map((s) => s.id),
              notes: customer.notes,
            }}
            services={customer.services.map((s) => ({ value: s.id, label: s.name }))}
            permissions={{
              write: canWrite,
              archive: hasPermission(user, "customers:archive"),
              newQuotation: canNewQuotation,
              newInvoice: canNewInvoice,
            }}
          />
        }
      />

      {customer.archived && (
        <div className="animate-fade-up bg-muted/60 text-muted-foreground rounded-xl border px-4 py-3 text-sm">
          This customer is archived. It is hidden from lists and pickers, but all of its records are kept.
        </div>
      )}

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {customer.financials ? (
          <>
            <StatCard label="Total invoiced" value={customer.financials.invoicedPaise} format="inr" icon={Receipt} hint="Excludes drafts and cancelled" />
            <StatCard label="Received" value={customer.financials.receivedPaise} format="inr" icon={Wallet} accent="success" hint="Recorded payments" />
            <StatCard
              label="Outstanding"
              value={customer.financials.outstandingPaise}
              format="inr"
              icon={Hourglass}
              accent={customer.financials.outstandingPaise > 0 ? "warning" : "success"}
              hint={customer.financials.outstandingPaise > 0 ? "Balance on unpaid invoices" : "Nothing due"}
            />
          </>
        ) : (
          <>
            <StatCard label="Services purchased" value={customer.servicesCount} icon={Layers} />
            <StatCard label="Interactions logged" value={customer.communications.length} icon={MessagesSquare} accent="info" />
            <StatCard label="Open tasks" value={openTasks} icon={ListChecks} accent="warning" />
          </>
        )}
        <StatCard
          label="Active projects"
          value={customer.activeProjects}
          icon={FolderKanban}
          accent="info"
          hint={`${customer.projects.length} project${customer.projects.length === 1 ? "" : "s"} in total`}
        />
      </div>

      <Tabs defaultValue="overview" className="animate-fade-up gap-4" style={{ "--delay": "120ms" } as React.CSSProperties}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="line" className="w-max min-w-full justify-start border-b pb-0 sm:min-w-0 sm:w-full">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="group/tab flex-none px-3">
                {tab.label}
                {typeof tab.count === "number" && <TabCount value={tab.count} />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="stagger grid items-start gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Customer details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList
                  items={[
                    { label: "Contact name", value: customer.name },
                    { label: "Business name", value: customer.businessName },
                    { label: "Customer type", value: CUSTOMER_TYPE_LABELS[customer.type] },
                    { label: "Customer number", value: customer.customerNumber },
                    { label: "GSTIN", value: customer.gstin ? <span className="font-mono tracking-wide">{customer.gstin}</span> : null },
                    { label: "State", value: customer.state ? `${customer.state}${stateCode ? ` (${stateCode})` : ""}` : null },
                    { label: "Billing address", value: fullAddress, wide: true },
                    {
                      label: "Services purchased",
                      wide: true,
                      value: customer.services.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {customer.services.map((s) => (
                            <StatusBadge key={s.id} tone="primary">
                              {s.name}
                            </StatusBadge>
                          ))}
                        </span>
                      ) : null,
                    },
                    { label: "Created by", value: customer.createdByName },
                    {
                      label: "Source",
                      value: customer.sourceLeadId ? (
                        <Link href={`/leads/${customer.sourceLeadId}`} className="text-primary underline-offset-4 hover:underline">
                          Converted from a lead
                        </Link>
                      ) : (
                        "Added directly"
                      ),
                    },
                    { label: "Notes", value: customer.notes, wide: true },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="hover:text-primary flex items-center gap-3 transition-colors">
                  <Phone className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> {customer.phone}
                </a>
                {customer.whatsapp && (
                  <a
                    href={whatsappLink(customer.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary flex items-center gap-3 transition-colors"
                  >
                    <MessageCircle className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> {customer.whatsapp}
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="hover:text-primary flex items-center gap-3 break-all transition-colors">
                    <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> {customer.email}
                  </a>
                )}
                {fullAddress && (
                  <p className="flex items-start gap-3">
                    <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" /> {fullAddress}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <ProjectsTable
            items={customer.projects}
            empty={{ icon: FolderKanban, title: "No projects yet", description: "Projects for this customer will be listed here." }}
          />
        </TabsContent>

        {customer.quotations && (
          <TabsContent value="quotations">
            <QuotationsTable
              items={customer.quotations}
              empty={{
                icon: FileText,
                title: "No quotations yet",
                description: "Quotations prepared for this customer will appear here.",
                action: canNewQuotation ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/quotations/new?customer=${customer.id}`}>New quotation</Link>
                  </Button>
                ) : undefined,
              }}
            />
          </TabsContent>
        )}

        {customer.invoices && (
          <TabsContent value="invoices">
            <InvoicesTable
              items={customer.invoices}
              empty={{
                icon: Receipt,
                title: "No invoices yet",
                description: "Invoices issued to this customer will appear here.",
                action: canNewInvoice ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/invoices/new?customer=${customer.id}`}>New invoice</Link>
                  </Button>
                ) : undefined,
              }}
            />
          </TabsContent>
        )}

        {customer.payments && (
          <TabsContent value="payments">
            <PaymentsTable
              items={customer.payments}
              empty={{ icon: IndianRupee, title: "No payments yet", description: "Payments received from this customer will appear here." }}
            />
          </TabsContent>
        )}

        {customer.tasks && (
          <TabsContent value="tasks">
            <TasksTable
              items={customer.tasks}
              now={now}
              empty={{ icon: ListChecks, title: "No tasks", description: "Tasks linked to this customer will appear here." }}
            />
          </TabsContent>
        )}

        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <CardTitle>Communication history</CardTitle>
            </CardHeader>
            <CardContent>
              <CommunicationLog
                items={customer.communications}
                endpoint={`/api/customers/${customer.id}/communications`}
                canWrite={canWrite && !customer.archived}
                allowFollowUp={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function CustomerPage(props: PageProps<"/customers/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CustomerDetail params={props.params} />
    </Suspense>
  );
}
