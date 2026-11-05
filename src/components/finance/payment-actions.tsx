"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Download, Loader2, MoreHorizontal, Plus, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { api, handleFormError } from "@/lib/client/api";
import { voidPaymentSchema } from "@/lib/validations/finance";
import { formatINR } from "@/lib/utils/money";
import { RecordPaymentSheet } from "./record-payment-sheet";

export function RecordPaymentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Record payment
      </Button>
      <RecordPaymentSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function PaymentRowActions({
  id,
  paymentNumber,
  amountPaise,
  voided,
  canVoid,
}: {
  id: string;
  paymentNumber: string;
  amountPaise: number;
  voided: boolean;
  canVoid: boolean;
}) {
  const router = useRouter();
  const [voidOpen, setVoidOpen] = useState(false);
  const form = useForm<{ reason: string }>({ resolver: zodResolver(voidPaymentSchema), defaultValues: { reason: "" } });

  const submit = form.handleSubmit(async (values) => {
    try {
      await api(`/api/payments/${id}/void`, { body: values });
      toast.success(`${paymentNumber} voided`);
      setVoidOpen(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${paymentNumber}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/api/payments/${id}/receipt`} download>
              <Download aria-hidden="true" /> Download receipt
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/payments/${id}/receipt?inline=1`} target="_blank" rel="noopener noreferrer">
              <Printer aria-hidden="true" /> Print receipt
            </a>
          </DropdownMenuItem>
          {canVoid && !voided && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setVoidOpen(true)}>
                <Ban aria-hidden="true" /> Void payment
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={voidOpen} onOpenChange={(open) => !form.formState.isSubmitting && setVoidOpen(open)}>
        <DialogContent>
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Void {paymentNumber}?</DialogTitle>
              <DialogDescription>
                {formatINR(amountPaise)} will no longer count as received and the invoice balance is restored. The payment stays on record, marked as void.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <TextField control={form.control} name="reason" label="Reason" required placeholder="e.g. Cheque bounced, entered twice" />
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVoidOpen(false)}>
                Keep payment
              </Button>
              <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Void payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
