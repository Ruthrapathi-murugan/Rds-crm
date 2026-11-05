import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { PageHeader } from "@/components/common/page-header";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { DocumentEditor } from "@/components/finance/document-editor";
import { linesToInput, loadEditorContext } from "@/components/finance/editor-data";
import { requireUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions";
import { toDateInputValue } from "@/lib/utils/date";
import { getQuotation } from "@/services/quotation.service";

export const metadata: Metadata = { title: "Edit quotation" };

async function EditQuotation({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "quotations:write")) return <AccessDenied />;
  const { id } = await params;
  const [quotation, { editor }] = await Promise.all([getQuotation(user, id), loadEditorContext()]);
  if (!quotation) notFound();
  if (!quotation.editable) redirect(`/quotations/${id}`);
  return (
    <>
      <PageHeader title={`Edit ${quotation.quotationNumber}`} back={{ href: `/quotations/${id}`, label: quotation.quotationNumber }} />
      <DocumentEditor
        kind="quotation"
        documentId={id}
        settings={editor}
        initialBillTo={quotation.billTo}
        initialOptions={{
          customer: { value: quotation.customerId, label: quotation.customerName },
          project: quotation.projectId ? { value: quotation.projectId, label: quotation.projectName ?? "Project" } : undefined,
          lead: quotation.leadId ? { value: quotation.leadId, label: quotation.leadName ?? "Lead" } : undefined,
        }}
        initialValues={{
          customer: quotation.customerId,
          project: quotation.projectId ?? "",
          lead: quotation.leadId ?? "",
          taxMode: quotation.taxMode,
          issueDate: toDateInputValue(quotation.issueDate),
          endDate: toDateInputValue(quotation.validUntil),
          items: linesToInput(quotation.items),
          terms: quotation.terms,
          notes: quotation.notes,
        }}
      />
    </>
  );
}

export default function EditQuotationPage(props: PageProps<"/quotations/[id]/edit">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <EditQuotation params={props.params} />
    </Suspense>
  );
}
