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
import { getInvoice } from "@/services/invoice.service";

export const metadata: Metadata = { title: "Edit draft invoice" };

async function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "invoices:write")) return <AccessDenied />;
  const { id } = await params;
  const [invoice, { editor }] = await Promise.all([getInvoice(user, id), loadEditorContext()]);
  if (!invoice) notFound();
  if (invoice.storedStatus !== "draft") redirect(`/invoices/${id}`);
  return (
    <>
      <PageHeader title="Edit draft invoice" back={{ href: `/invoices/${id}`, label: "Draft invoice" }} />
      <DocumentEditor
        kind="invoice"
        documentId={id}
        settings={editor}
        initialBillTo={invoice.billTo}
        initialOptions={{
          customer: { value: invoice.customerId, label: invoice.customerName },
          project: invoice.projectId ? { value: invoice.projectId, label: invoice.projectName ?? "Project" } : undefined,
        }}
        initialValues={{
          customer: invoice.customerId,
          project: invoice.projectId ?? "",
          lead: "",
          taxMode: invoice.taxMode,
          issueDate: toDateInputValue(invoice.issueDate),
          endDate: toDateInputValue(invoice.dueDate),
          items: linesToInput(invoice.items),
          terms: invoice.terms,
          notes: invoice.notes,
        }}
      />
    </>
  );
}

export default function EditInvoicePage(props: PageProps<"/invoices/[id]/edit">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <EditInvoice params={props.params} />
    </Suspense>
  );
}
