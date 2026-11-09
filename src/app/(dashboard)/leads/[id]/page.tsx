import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BadgeCheck, CalendarClock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { AccessDenied } from "@/components/common/access-denied";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { CommunicationLog } from "@/components/common/communication-log";
import { DetailList } from "@/components/common/detail-list";
import { PageHeader } from "@/components/common/page-header";
import { EnumBadge, StatusBadge } from "@/components/common/status-badge";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { LeadDetailActions } from "@/components/leads/lead-detail-actions";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { LEAD_STATUS_TONES } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { dateTimeInputOrEmpty, formatDate, formatDateTime } from "@/lib/utils/date";
import { formatINR, paiseToInput } from "@/lib/utils/money";
import { listEntityActivity } from "@/services/activity.service";
import { getLead } from "@/services/lead.service";

export const metadata: Metadata = { title: "Lead" };

function whatsappLink(number: string) {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "leads:read")) return <AccessDenied />;
  const { id } = await params;
  const lead = await getLead(user, id);
  if (!lead) notFound();
  const activity = await listEntityActivity("lead", lead.id);
  const now = new Date();
  const followUpOverdue =
    lead.nextFollowUpAt && !["won", "lost"].includes(lead.status) && new Date(lead.nextFollowUpAt) < now;

  return (
    <>
      <PageHeader
        back={{ href: "/leads", label: "Leads" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lead.contactName}
            <EnumBadge value={lead.status} labels={LEAD_STATUS_LABELS} tones={LEAD_STATUS_TONES} />
            {lead.archived && <StatusBadge tone="muted">Archived</StatusBadge>}
          </span>
        }
        description={[lead.leadNumber, lead.businessName, `Added ${formatDate(lead.createdAt)}`].filter(Boolean).join(" · ")}
        actions={
          <LeadDetailActions
            lead={lead}
            formValues={{
              contactName: lead.contactName,
              businessName: lead.businessName,
              phone: lead.phone,
              whatsapp: lead.whatsapp,
              email: lead.email,
              location: lead.location,
              interestedService: lead.interestedServiceId ?? "",
              source: lead.source,
              estimatedValue: paiseToInput(lead.estimatedValuePaise),
              status: lead.status,
              assignedTo: lead.assignedToId ?? "",
              nextFollowUpAt: dateTimeInputOrEmpty(lead.nextFollowUpAt),
              notes: lead.notes,
            }}
            permissions={{
              write: hasPermission(user, "leads:write"),
              archive: hasPermission(user, "leads:archive"),
              convert: hasPermission(user, "leads:convert") && hasPermission(user, "customers:write"),
              createProject: hasPermission(user, "projects:write"),
            }}
          />
        }
      />

      {lead.converted && lead.convertedCustomerId && (
        <div className="animate-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <BadgeCheck className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Converted to a customer{lead.convertedAt ? ` on ${formatDate(lead.convertedAt)}` : ""}.
          </span>
          <Link href={`/customers/${lead.convertedCustomerId}`} className="font-medium underline underline-offset-4">
            View customer
          </Link>
        </div>
      )}

      <div className="stagger grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Enquiry details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Interested service", value: lead.serviceName },
                  { label: "Lead source", value: LEAD_SOURCE_LABELS[lead.source] },
                  { label: "Estimated value", value: lead.estimatedValuePaise ? formatINR(lead.estimatedValuePaise) : null },
                  { label: "Assigned to", value: lead.assignedToName ?? "Unassigned" },
                  { label: "Business location", value: lead.location },
                  { label: "Created by", value: lead.createdByName },
                  ...(lead.status === "lost" && lead.lostReason ? [{ label: "Reason lost", value: lead.lostReason, wide: true }] : []),
                  { label: "Notes", value: lead.notes, wide: true },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Communication history</CardTitle>
            </CardHeader>
            <CardContent>
              <CommunicationLog
                items={lead.communications}
                endpoint={`/api/leads/${lead.id}/communications`}
                canWrite={hasPermission(user, "leads:write") && !lead.archived}
                allowFollowUp={!lead.converted}
              />
            </CardContent>
          </Card>
          <RelatedTasks lead={lead.id} />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="hover:text-primary flex items-center gap-3 transition-colors">
                <Phone className="text-muted-foreground size-4" aria-hidden="true" /> {lead.phone}
              </a>
              {lead.whatsapp && (
                <a
                  href={whatsappLink(lead.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary flex items-center gap-3 transition-colors"
                >
                  <MessageCircle className="text-muted-foreground size-4" aria-hidden="true" /> {lead.whatsapp}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="hover:text-primary flex items-center gap-3 break-all transition-colors">
                  <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> {lead.email}
                </a>
              )}
              {lead.location && (
                <p className="flex items-center gap-3">
                  <MapPin className="text-muted-foreground size-4" aria-hidden="true" /> {lead.location}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className={cn(followUpOverdue && "border-destructive/40")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" aria-hidden="true" /> Next follow-up
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.nextFollowUpAt ? (
                <p className={cn("text-sm font-medium", followUpOverdue && "text-destructive")}>
                  {formatDateTime(lead.nextFollowUpAt)}
                  {followUpOverdue && " · Overdue"}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">Not scheduled</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function LeadPage(props: PageProps<"/leads/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <LeadDetail params={props.params} />
    </Suspense>
  );
}
