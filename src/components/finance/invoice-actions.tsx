"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, IndianRupee, Loader2, Mail, Pencil, Stamp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { api, handleFormError } from "@/lib/client/api";
import type { StoredInvoiceStatus } from "@/lib/constants";
import { cancelInvoiceSchema, emailDocumentSchema } from "@/lib/validations/finance";
import { PdfButtons } from "./pdf-buttons";
import { RecordPaymentSheet } from "./record-payment-sheet";

export function InvoiceActions({
  id,
  label,
  storedStatus,
  balancePaise,
  customerEmail,
  emailEnabled,
  permissions,
}: {
  id: string;
  label: string;
  storedStatus: StoredInvoiceStatus;
  balancePaise: number;
  customerEmail: string;
  emailEnabled: boolean;
  permissions: { write: boolean; cancel: boolean; recordPayment: boolean };
}) {
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const isDraft = storedStatus === "draft";
  const payable = (storedStatus === "sent" || storedStatus === "partially_paid") && balancePaise > 0;

  const cancelForm = useForm<{ reason: string }>({ resolver: zodResolver(cancelInvoiceSchema), defaultValues: { reason: "" } });
  const emailForm = useForm<{ to: string; message: string }>({
    resolver: zodResolver(emailDocumentSchema, undefined, { raw: true }) as unknown as Resolver<{ to: string; message: string }>,
    defaultValues: { to: customerEmail, message: "" },
  });

  const submitCancel = cancelForm.handleSubmit(async (values) => {
    try {
      await api(`/api/invoices/${id}/cancel`, { body: values });
      toast.success(`${label} cancelled`);
      setCancelOpen(false);
      router.refresh();
    } catch (error) {
      handleFormError(cancelForm, error);
    }
  });

  const submitEmail = emailForm.handleSubmit(async (values) => {
    try {
      await api(`/api/invoices/${id}/email`, { body: values });
      toast.success(`Invoice emailed to ${values.to}`);
      setEmailOpen(false);
      router.refresh();
    } catch (error) {
      handleFormError(emailForm, error);
    }
  });

  return (
    <>
      {permissions.write && isDraft && (
        <ConfirmDialog
          trigger={
            <Button>
              <Stamp className="size-4" aria-hidden="true" /> Issue invoice
            </Button>
          }
          title="Issue this invoice?"
          description="The next number in this financial year's series is assigned and the invoice is locked for editing. Issued invoices are kept for audit; corrections are made by cancelling and issuing a new one."
          confirmLabel="Issue invoice"
          onConfirm={async () => {
            const result = await api<{ invoiceNumber: string }>(`/api/invoices/${id}/issue`, { method: "POST" });
            toast.success(`Invoice ${result.invoiceNumber} issued`);
            router.refresh();
          }}
        />
      )}
      {permissions.recordPayment && payable && (
        <Button onClick={() => setPaymentOpen(true)}>
          <IndianRupee className="size-4" aria-hidden="true" /> Record payment
        </Button>
      )}
      {permissions.write && isDraft && (
        <Button asChild variant="outline">
          <Link href={`/invoices/${id}/edit`}>
            <Pencil className="size-4" aria-hidden="true" /> Edit
          </Link>
        </Button>
      )}
      <PdfButtons href={`/api/invoices/${id}/pdf`} />
      {permissions.write && !isDraft && storedStatus !== "cancelled" && emailEnabled && (
        <Button variant="outline" onClick={() => setEmailOpen(true)}>
          <Mail className="size-4" aria-hidden="true" /> Email
        </Button>
      )}
      {permissions.write && isDraft && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-destructive">
              <Trash2 className="size-4" aria-hidden="true" /> Delete draft
            </Button>
          }
          title="Delete this draft invoice?"
          description="Drafts have no invoice number yet, so deleting one leaves no gap in your numbering. This cannot be undone."
          confirmLabel="Delete draft"
          destructive
          onConfirm={async () => {
            await api(`/api/invoices/${id}`, { method: "DELETE" });
            toast.success("Draft deleted");
            router.push("/invoices");
            router.refresh();
          }}
        />
      )}
      {permissions.cancel && !isDraft && storedStatus !== "cancelled" && (
        <Button variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)}>
          <Ban className="size-4" aria-hidden="true" /> Cancel invoice
        </Button>
      )}

      {payable && (
        <RecordPaymentSheet open={paymentOpen} onOpenChange={setPaymentOpen} invoice={{ id, label, balancePaise }} />
      )}

      <Dialog open={cancelOpen} onOpenChange={(open) => !cancelForm.formState.isSubmitting && setCancelOpen(open)}>
        <DialogContent>
          <form onSubmit={submitCancel} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Cancel {label}?</DialogTitle>
              <DialogDescription>
                The invoice stays on record with a CANCELLED mark and is excluded from receivables. Invoices with recorded payments must have those payments voided first.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <TextField control={cancelForm.control} name="reason" label="Reason" required placeholder="e.g. Raised against the wrong customer" />
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                Keep invoice
              </Button>
              <Button type="submit" variant="destructive" disabled={cancelForm.formState.isSubmitting}>
                {cancelForm.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Cancel invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={emailOpen} onOpenChange={(open) => !emailForm.formState.isSubmitting && setEmailOpen(open)}>
        <DialogContent>
          <form onSubmit={submitEmail} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Email {label}</DialogTitle>
              <DialogDescription>The invoice PDF is attached to the email.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <TextField control={emailForm.control} name="to" label="To" type="email" required />
              <TextareaField control={emailForm.control} name="message" label="Message (optional)" rows={3} />
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmailOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={emailForm.formState.isSubmitting}>
                {emailForm.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
