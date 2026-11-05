"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { DateField, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, handleFormError } from "@/lib/client/api";
import { optionsOf, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { toDateInputValue } from "@/lib/utils/date";
import { formatINR, paiseToInput } from "@/lib/utils/money";
import { paymentFormSchema, type PaymentFormInput } from "@/lib/validations/finance";

type FixedInvoice = { id: string; label: string; balancePaise: number };

/**
 * Records money received, either against an issued invoice or as an advance
 * for a customer. A fresh idempotency key per opening makes double clicks
 * and retries safe; the server decides customer, limits and invoice status.
 */
export function RecordPaymentSheet({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: FixedInvoice;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"invoice" | "advance">("invoice");
  const [maxPaise, setMaxPaise] = useState<number | null>(invoice?.balancePaise ?? null);

  const blank = (): PaymentFormInput => ({
    customer: "",
    invoice: invoice?.id ?? "",
    project: "",
    paidAt: toDateInputValue(new Date()),
    amount: invoice ? paiseToInput(invoice.balancePaise) : "",
    method: "upi",
    transactionReference: "",
    notes: "",
    idempotencyKey: crypto.randomUUID(),
  });

  const form = useForm<PaymentFormInput>({ resolver: zodResolver(paymentFormSchema, undefined, { raw: true }), defaultValues: blank() });
  const customer = useWatch({ control: form.control, name: "customer" });

  // Reset local state when the sheet opens (adjusting state during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode("invoice");
      setMaxPaise(invoice?.balancePaise ?? null);
    }
  }

  useEffect(() => {
    // A fresh form (and idempotency key) every time the sheet opens.
    if (open) form.reset(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    const body = mode === "invoice" ? { ...values, customer: "", project: "" } : { ...values, invoice: "" };
    try {
      const result = await api<{ id: string; paymentNumber: string; duplicate: boolean }>("/api/payments", { body });
      if (result.duplicate) toast.info(`This payment was already recorded as ${result.paymentNumber}.`);
      else
        toast.success(`Payment ${result.paymentNumber} recorded`, {
          action: { label: "Receipt", onClick: () => window.open(`/api/payments/${result.id}/receipt?inline=1`, "_blank") },
        });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description={invoice ? `Against ${invoice.label}` : "Record money received from a customer."}
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel="Record payment"
    >
      <FieldGroup>
        {!invoice && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "invoice" | "advance")}>
            <TabsList className="w-full">
              <TabsTrigger value="invoice" className="flex-1">
                Against an invoice
              </TabsTrigger>
              <TabsTrigger value="advance" className="flex-1">
                Advance / no invoice
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {invoice ? (
          <div className="bg-primary/5 rounded-lg border p-3 text-sm">
            <p className="font-medium">{invoice.label}</p>
            <p className="text-muted-foreground">Outstanding balance {formatINR(invoice.balancePaise)}</p>
          </div>
        ) : mode === "invoice" ? (
          <ComboboxField
            control={form.control}
            name="invoice"
            label="Invoice"
            optionsUrl="/api/invoices/payable-options"
            placeholder="Search unpaid invoices…"
            emptyText="No unpaid issued invoices found."
            required
            onSelectOption={(option) => {
              const balance = (option as { balancePaise?: number } | null)?.balancePaise ?? null;
              setMaxPaise(balance);
              if (balance) form.setValue("amount", paiseToInput(balance));
            }}
          />
        ) : (
          <>
            <ComboboxField control={form.control} name="customer" label="Customer" optionsUrl="/api/customers/options" placeholder="Search customers…" required />
            <ComboboxField
              control={form.control}
              name="project"
              label="Project (optional)"
              optionsUrl={customer ? `/api/projects/options?customer=${customer}` : "/api/projects/options"}
              placeholder="Link to a project"
              disabled={!customer}
            />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            control={form.control}
            name="amount"
            label="Amount received"
            required
            description={mode === "invoice" && maxPaise !== null ? `Up to ${formatINR(maxPaise)}` : undefined}
          />
          <DateField control={form.control} name="paidAt" label="Payment date" required max={toDateInputValue(new Date())} />
          <SelectField control={form.control} name="method" label="Method" options={optionsOf(PAYMENT_METHODS, PAYMENT_METHOD_LABELS)} required />
          <TextField control={form.control} name="transactionReference" label="Transaction reference" placeholder="UTR / UPI ref / cheque no." />
        </div>
        <TextareaField control={form.control} name="notes" label="Notes" rows={2} maxLength={1000} />
        <p className="text-muted-foreground text-xs">
          Record a payment only after the money has reached the account. Gateway payments should be confirmed in the gateway dashboard first.
        </p>
      </FieldGroup>
    </FormSheet>
  );
}
