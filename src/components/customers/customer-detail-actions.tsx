"use client";

import { Archive, ArchiveRestore, FileText, Pencil, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import type { CustomerFormInput } from "@/lib/validations/customer";
import type { Option } from "@/types";
import { CustomerFormSheet } from "./customer-form-sheet";

export function CustomerDetailActions({
  customer,
  formValues,
  services,
  permissions,
}: {
  customer: { id: string; name: string; archived: boolean };
  formValues: CustomerFormInput;
  services: Option[];
  permissions: { write: boolean; archive: boolean; newQuotation: boolean; newInvoice: boolean };
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <>
      {permissions.newQuotation && !customer.archived && (
        <Button variant="outline" asChild>
          <Link href={`/quotations/new?customer=${customer.id}`}>
            <FileText className="size-4" aria-hidden="true" /> New quotation
          </Link>
        </Button>
      )}
      {permissions.newInvoice && !customer.archived && (
        <Button asChild>
          <Link href={`/invoices/new?customer=${customer.id}`}>
            <Receipt className="size-4" aria-hidden="true" /> New invoice
          </Link>
        </Button>
      )}
      {permissions.write && !customer.archived && (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" aria-hidden="true" /> Edit
        </Button>
      )}
      {permissions.archive && (
        <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
          {customer.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
          {customer.archived ? "Restore" : "Archive"}
        </Button>
      )}

      {permissions.write && (
        <CustomerFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          customerId={customer.id}
          initialValues={formValues}
          initialServices={services}
        />
      )}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={customer.archived ? `Restore ${customer.name}?` : `Archive ${customer.name}?`}
        description={
          customer.archived
            ? "The customer will appear in lists and pickers again."
            : "The customer will be hidden from lists and pickers. Projects, quotations, invoices and payments are kept unchanged."
        }
        confirmLabel={customer.archived ? "Restore" : "Archive"}
        destructive={!customer.archived}
        onConfirm={async () => {
          await api(`/api/customers/${customer.id}/archive`, { body: { archived: !customer.archived } });
          toast.success(customer.archived ? "Customer restored" : "Customer archived");
          router.refresh();
        }}
      />
    </>
  );
}
