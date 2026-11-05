"use client";

import { Check, FileOutput, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { QUOTATION_STATUS_LABELS, type QuotationStatus } from "@/lib/constants";
import { PdfButtons } from "./pdf-buttons";

const TRANSITION_UI: Partial<Record<QuotationStatus, { label: string; icon: typeof Send; variant: "default" | "outline" }>> = {
  sent: { label: "Mark as sent", icon: Send, variant: "default" },
  accepted: { label: "Mark accepted", icon: Check, variant: "default" },
  rejected: { label: "Mark rejected", icon: X, variant: "outline" },
  draft: { label: "Back to draft", icon: RotateCcw, variant: "outline" },
};

export function QuotationActions({
  id,
  number,
  storedStatus,
  allowedTransitions,
  editable,
  canWrite,
  canConvert,
}: {
  id: string;
  number: string;
  storedStatus: QuotationStatus;
  allowedTransitions: QuotationStatus[];
  editable: boolean;
  canWrite: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();

  async function setStatus(status: QuotationStatus) {
    try {
      await api(`/api/quotations/${id}/status`, { method: "PATCH", body: { status } });
      toast.success(`${number} marked ${QUOTATION_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the quotation");
    }
  }

  return (
    <>
      {canWrite &&
        allowedTransitions.map((status) => {
          const ui = TRANSITION_UI[status];
          if (!ui) return null;
          return (
            <Button key={status} variant={ui.variant} onClick={() => void setStatus(status)}>
              <ui.icon className="size-4" aria-hidden="true" /> {ui.label}
            </Button>
          );
        })}
      {canConvert && (storedStatus === "sent" || storedStatus === "accepted") && (
        <ConfirmDialog
          trigger={
            <Button>
              <FileOutput className="size-4" aria-hidden="true" /> Convert to invoice
            </Button>
          }
          title={`Convert ${number} to an invoice?`}
          description="A draft invoice is created with the same customer, items and tax treatment. You can review it before issuing. A quotation can only be converted once."
          confirmLabel="Create draft invoice"
          onConfirm={async () => {
            const result = await api<{ invoiceId: string }>(`/api/quotations/${id}/convert`, { method: "POST" });
            toast.success("Draft invoice created");
            router.push(`/invoices/${result.invoiceId}`);
          }}
        />
      )}
      {canWrite && editable && (
        <Button asChild variant="outline">
          <Link href={`/quotations/${id}/edit`}>
            <Pencil className="size-4" aria-hidden="true" /> Edit
          </Link>
        </Button>
      )}
      <PdfButtons href={`/api/quotations/${id}/pdf`} />
      {canWrite && storedStatus === "draft" && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-destructive">
              <Trash2 className="size-4" aria-hidden="true" /> Delete
            </Button>
          }
          title={`Delete draft ${number}?`}
          description="Draft quotations can be deleted. This cannot be undone."
          confirmLabel="Delete draft"
          destructive
          onConfirm={async () => {
            await api(`/api/quotations/${id}`, { method: "DELETE" });
            toast.success("Draft quotation deleted");
            router.push("/quotations");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
