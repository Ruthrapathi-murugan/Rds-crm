import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { PageHeader } from "@/components/common/page-header";
import { DetailSkeleton } from "@/components/data-table/table-skeleton";
import { DocumentEditor } from "@/components/finance/document-editor";
import { EMPTY_LINE } from "@/lib/finance/editor-defaults";
import { customerPrefill, loadEditorContext } from "@/components/finance/editor-data";
import { requireUser } from "@/lib/auth/current-user";
import { firstParam, type SearchParamsRecord } from "@/lib/list-params";
import { hasPermission } from "@/lib/permissions";

export const metadata: Metadata = { title: "New quotation" };

async function NewQuotation({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const user = await requireUser();
  if (!hasPermission(user, "quotations:write")) return <AccessDenied />;
  const sp = await searchParams;
  const [{ editor, settings, today, plusDays }, prefill] = await Promise.all([
    loadEditorContext(),
    customerPrefill(firstParam(sp, "customer")),
  ]);
  return (
    <DocumentEditor
      kind="quotation"
      settings={editor}
      initialBillTo={prefill?.billTo ?? null}
      initialOptions={{ customer: prefill?.option }}
      initialValues={{
        customer: prefill?.option.value ?? "",
        project: "",
        lead: "",
        taxMode: "none",
        issueDate: today,
        endDate: plusDays(settings.defaultQuotationValidityDays),
        items: [{ ...EMPTY_LINE }],
        terms: settings.quotationTerms,
        notes: "",
      }}
    />
  );
}

export default function NewQuotationPage(props: PageProps<"/quotations/new">) {
  return (
    <>
      <PageHeader title="New quotation" description="Build a priced proposal for a customer." back={{ href: "/quotations", label: "Quotations" }} />
      <Suspense fallback={<DetailSkeleton />}>
        <NewQuotation searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
