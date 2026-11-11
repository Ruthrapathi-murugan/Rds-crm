"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ComboboxField } from "@/components/forms/combobox-field";
import { DateField, MoneyField, NumberField, SelectField, TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useOptions } from "@/hooks/use-options";
import { api, ApiClientError, handleFormError } from "@/lib/client/api";
import { TAX_MODE_LABELS, TAX_MODES, type TaxMode } from "@/lib/constants";
import { computeLine, invoiceTitle } from "@/lib/finance/document-calc";
import { EMPTY_LINE } from "@/lib/finance/editor-defaults";
import { cn } from "@/lib/utils";
import { customSacOption, SAC_OPTIONS } from "@/lib/sac-codes";
import { formatBasisPoints, formatINR, paiseToInput } from "@/lib/utils/money";
import { lineItemInput, type LineItemInput } from "@/lib/validations/finance";
import { dateInput, objectId, optionalObjectId, optionalText } from "@/lib/validations/common";
import type { BillTo } from "@/services/finance/documents";

type ServiceOptionLite = {
  value: string;
  label: string;
  description?: string;
  basePricePaise?: number;
  sacCode?: string;
  defaultTaxRateBps?: number | null;
};

export type EditorSettings = {
  gstRegistered: boolean;
  taxRates: { label: string; rateBps: number }[];
  defaultTerms: string;
};

export type EditorValues = {
  customer: string;
  project: string;
  lead: string;
  taxMode: TaxMode;
  issueDate: string;
  endDate: string;
  items: LineItemInput[];
  terms: string;
  notes: string;
};

const editorSchema = z
  .object({
    customer: objectId,
    project: optionalObjectId,
    lead: optionalObjectId,
    taxMode: z.enum(TAX_MODES),
    issueDate: dateInput,
    endDate: dateInput,
    items: z.array(lineItemInput).min(1, "Add at least one line item").max(50),
    terms: optionalText(5000),
    notes: optionalText(2000),
  })
  .refine((v) => v.endDate.getTime() >= v.issueDate.getTime(), { path: ["endDate"], message: "Must be on or after the document date" });


const rateValue = (bps: number) => String(bps / 100);

/**
 * Shared editor for quotations and invoices. Totals preview with the same
 * calculation the server uses; the server recomputes everything on save.
 */
export function DocumentEditor({
  kind,
  documentId,
  initialValues,
  initialBillTo,
  settings,
  initialOptions,
}: {
  kind: "quotation" | "invoice";
  documentId?: string;
  initialValues: EditorValues;
  initialBillTo?: BillTo | null;
  settings: EditorSettings;
  initialOptions?: { customer?: { value: string; label: string }; project?: { value: string; label: string }; lead?: { value: string; label: string } };
}) {
  const router = useRouter();
  const { options: services } = useOptions("/api/services/options");
  const [billTo, setBillTo] = useState<BillTo | null>(initialBillTo ?? null);
  const [suggested, setSuggested] = useState<TaxMode | null>(null);

  const form = useForm<EditorValues>({
    // raw: post the typed strings; the server parses them with the same schemas.
    resolver: zodResolver(editorSchema, undefined, { raw: true }) as unknown as Resolver<EditorValues>,
    defaultValues: initialValues,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const [customer, taxMode, items] = useWatch({ control: form.control, name: ["customer", "taxMode", "items"] });

  // Load billing details and the GST suggestion when the customer changes.
  useEffect(() => {
    if (!customer || !/^[a-f0-9]{24}$/i.test(customer)) return;
    const controller = new AbortController();
    api<{ billTo: BillTo; suggestedTaxMode: TaxMode }>(`/api/invoices/billing-preview?customer=${customer}`, { signal: controller.signal })
      .then((result) => {
        setBillTo(result.billTo);
        setSuggested(result.suggestedTaxMode);
        if (!documentId) form.setValue("taxMode", result.suggestedTaxMode);
      })
      .catch((error) => {
        if (error instanceof ApiClientError) toast.error(error.message);
      });
    return () => controller.abort();
  }, [customer, documentId, form]);

  // Live preview: each line is computed on its own (invalid lines show no total),
  // and the summary adds up the valid lines exactly like the server will.
  const preview = useMemo(() => {
    const lines = (items ?? []).map((item) => {
      const parsed = lineItemInput.safeParse(item);
      if (!parsed.success) return null;
      try {
        const l = parsed.data;
        return computeLine({ quantity: l.quantity, unitPricePaise: l.unitPrice, discountPaise: l.discount, taxRateBps: l.taxRate }, taxMode);
      } catch {
        return null;
      }
    });
    const valid = lines.filter((l): l is NonNullable<typeof l> => l !== null);
    if (valid.length === 0) return { items: lines, totals: null };
    const sum = (key: "amountPaise" | "discountPaise" | "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise") =>
      valid.reduce((total, l) => total + l[key], 0);
    return {
      items: lines,
      totals: {
        subtotalPaise: sum("amountPaise"),
        discountPaise: sum("discountPaise"),
        taxablePaise: sum("taxablePaise"),
        cgstPaise: sum("cgstPaise"),
        sgstPaise: sum("sgstPaise"),
        igstPaise: sum("igstPaise"),
        totalPaise: sum("totalPaise"),
      },
    };
  }, [items, taxMode]);

  const taxOptions = settings.taxRates.map((t) => ({ value: rateValue(t.rateBps), label: `${t.label} (${formatBasisPoints(t.rateBps)})` }));
  const taxModeOptions = TAX_MODES.filter((m) => settings.gstRegistered || m === "none").map((m) => ({ value: m, label: TAX_MODE_LABELS[m] }));

  function applyService(index: number, option: ServiceOptionLite | null) {
    if (!option) return;
    const current = form.getValues(`items.${index}`);
    if (!current.description) form.setValue(`items.${index}.description`, option.label, { shouldValidate: true });
    if (!current.unitPrice && option.basePricePaise) form.setValue(`items.${index}.unitPrice`, paiseToInput(option.basePricePaise));
    if (!current.sacCode && option.sacCode) form.setValue(`items.${index}.sacCode`, option.sacCode);
    if (option.defaultTaxRateBps !== null && option.defaultTaxRateBps !== undefined && settings.taxRates.some((t) => t.rateBps === option.defaultTaxRateBps)) {
      form.setValue(`items.${index}.taxRate`, rateValue(option.defaultTaxRateBps));
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    // A GST document must state the rate on every line (0% only when chosen deliberately).
    if (values.taxMode !== "none") {
      const missing = values.items.flatMap((item, index) => (item.taxRate === "" || item.taxRate === undefined ? [index] : []));
      if (missing.length) {
        for (const index of missing) form.setError(`items.${index}.taxRate`, { type: "required", message: "Choose a GST rate" });
        toast.error("Choose a GST rate for every line.");
        return;
      }
    }
    const payload = {
      customer: values.customer,
      project: values.project,
      taxMode: values.taxMode,
      issueDate: values.issueDate,
      items: values.items.map((item) => ({ ...item, taxRate: values.taxMode === "none" ? "" : item.taxRate })),
      terms: values.terms,
      notes: values.notes,
      ...(kind === "quotation" ? { lead: values.lead, validUntil: values.endDate } : { dueDate: values.endDate }),
    };
    const base = kind === "quotation" ? "/api/quotations" : "/api/invoices";
    try {
      const result = documentId
        ? await api<{ id: string }>(`${base}/${documentId}`, { method: "PUT", body: payload })
        : await api<{ id: string }>(base, { body: payload });
      toast.success(documentId ? "Changes saved" : kind === "quotation" ? "Quotation created" : "Draft invoice created");
      router.push(`/${kind === "quotation" ? "quotations" : "invoices"}/${result.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors) {
        for (const [key, messages] of Object.entries(error.fieldErrors)) {
          const mapped = key === "validUntil" || key === "dueDate" ? "endDate" : key;
          form.setError(mapped as keyof EditorValues, { type: "server", message: messages[0] });
        }
        toast.error(error.message);
      } else {
        handleFormError(form, error);
      }
    }
  });

  const title = kind === "quotation" ? "Quotation" : invoiceTitle({ gstRegistered: settings.gstRegistered, gstin: settings.gstRegistered ? "x" : "", taxMode });
  const itemErrors = form.formState.errors.items;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="stagger flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer & dates</CardTitle>
            <CardDescription>
              {kind === "invoice"
                ? "Invoices are saved as drafts. A number from the financial-year series is assigned when you issue it."
                : "The quotation number is assigned when you save."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2">
                <ComboboxField
                  control={form.control}
                  name="customer"
                  label="Customer"
                  optionsUrl="/api/customers/options"
                  initialOptions={initialOptions?.customer ? [initialOptions.customer] : []}
                  placeholder="Search customers…"
                  required
                  clearable={false}
                  onSelectOption={() => form.setValue("project", "")}
                  className="md:col-span-2"
                />
                <ComboboxField
                  control={form.control}
                  name="project"
                  label="Project (optional)"
                  optionsUrl={customer ? `/api/projects/options?customer=${customer}` : "/api/projects/options"}
                  initialOptions={initialOptions?.project ? [initialOptions.project] : []}
                  placeholder="Link to a project"
                  disabled={!customer}
                />
                {kind === "quotation" ? (
                  <ComboboxField
                    control={form.control}
                    name="lead"
                    label="Lead (optional)"
                    optionsUrl="/api/leads/options"
                    initialOptions={initialOptions?.lead ? [initialOptions.lead] : []}
                    placeholder="Link to a lead"
                  />
                ) : (
                  <div className="hidden md:block" />
                )}
                <DateField control={form.control} name="issueDate" label={kind === "quotation" ? "Quotation date" : "Invoice date"} required />
                <DateField control={form.control} name="endDate" label={kind === "quotation" ? "Valid until" : "Due date"} required />
              </div>
              {billTo && (
                <div className="bg-muted/40 animate-fade-in rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Billing details copied to the document</p>
                  <p className="font-medium">{billTo.businessName || billTo.name}</p>
                  <p className="text-muted-foreground">
                    {[billTo.address, billTo.city, billTo.state].filter(Boolean).join(", ") || "No address on file"}
                    {billTo.gstin && ` · GSTIN ${billTo.gstin}`}
                  </p>
                </div>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Line items</CardTitle>
              <CardDescription>Choose a service to fill in its description, price, SAC code and default tax rate.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {fields.map((field, index) => {
              const line = preview.items[index];
              const lineError = itemErrors?.[index]?.root?.message ?? (itemErrors?.[index] as { message?: string } | undefined)?.message;
              return (
                <div key={field.id} className="animate-fade-up bg-card relative rounded-xl border p-4 shadow-xs">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-semibold">Item {index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-6">
                    <ComboboxField
                      control={form.control}
                      name={`items.${index}.service`}
                      label="Service"
                      options={services}
                      placeholder="Choose a service (optional)"
                      onSelectOption={(option) => applyService(index, option as ServiceOptionLite | null)}
                      className="md:col-span-4"
                    />
                    <ComboboxField
                      control={form.control}
                      name={`items.${index}.sacCode`}
                      label="SAC / HSN"
                      options={SAC_OPTIONS}
                      customOption={customSacOption}
                      placeholder="Choose code"
                      searchPlaceholder="Search code or service, or type a code…"
                      emptyText="No match. Type a 4–8 digit code to use it."
                      className="md:col-span-2"
                    />
                    <TextareaField control={form.control} name={`items.${index}.description`} label="Description" rows={2} required className="md:col-span-6" />
                    <NumberField control={form.control} name={`items.${index}.quantity`} label="Qty" min={1} required className="md:col-span-1" />
                    <MoneyField control={form.control} name={`items.${index}.unitPrice`} label="Unit price" className="md:col-span-2" />
                    <MoneyField control={form.control} name={`items.${index}.discount`} label="Discount" className="md:col-span-1" />
                    {taxMode !== "none" ? (
                      <SelectField
                        control={form.control}
                        name={`items.${index}.taxRate`}
                        label="GST rate"
                        options={taxOptions}
                        placeholder="Choose rate"
                        className="md:col-span-2"
                      />
                    ) : (
                      <div className="md:col-span-2" />
                    )}
                  </div>
                  {lineError && <p className="text-destructive mt-2 text-sm">{lineError}</p>}
                  <div className="text-muted-foreground mt-3 flex flex-wrap justify-end gap-x-4 gap-y-1 border-t pt-3 text-sm">
                    {line ? (
                      <>
                        {taxMode !== "none" && <span>Taxable {formatINR(line.taxablePaise)}</span>}
                        {taxMode === "intra_state" && <span>CGST + SGST {formatINR(line.cgstPaise + line.sgstPaise)}</span>}
                        {taxMode === "inter_state" && <span>IGST {formatINR(line.igstPaise)}</span>}
                        <span className="text-foreground font-semibold">Line total {formatINR(line.totalPaise)}</span>
                      </>
                    ) : (
                      <span>Enter a quantity and price to see the total.</span>
                    )}
                  </div>
                </div>
              );
            })}
            {typeof itemErrors?.message === "string" && <p className="text-destructive text-sm">{itemErrors.message}</p>}
            <Button type="button" variant="outline" className="w-fit" onClick={() => append({ ...EMPTY_LINE })} disabled={fields.length >= 50}>
              <Plus className="size-4" aria-hidden="true" /> Add line item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms & notes</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <TextareaField control={form.control} name="terms" label="Terms & conditions" rows={4} maxLength={5000} />
              <TextareaField control={form.control} name="notes" label="Notes to the customer" rows={2} maxLength={2000} />
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start">
        <Card className="animate-fade-up gap-4">
          <CardHeader>
            <CardTitle>{documentId ? "Summary" : `New ${title.toLowerCase()}`}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SelectField control={form.control} name="taxMode" label="Tax treatment" options={taxModeOptions} required />
            {!settings.gstRegistered && (
              <p className="text-muted-foreground flex gap-2 text-xs">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                GST options appear once the business is marked GST-registered in Settings.
              </p>
            )}
            {suggested && suggested !== taxMode && (
              <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Suggested for this customer&apos;s state: {TAX_MODE_LABELS[suggested]}.
              </p>
            )}
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Subtotal" value={preview.totals?.subtotalPaise} />
              {(preview.totals?.discountPaise ?? 0) > 0 && <Row label="Discount" value={-(preview.totals?.discountPaise ?? 0)} />}
              {taxMode !== "none" && <Row label="Taxable value" value={preview.totals?.taxablePaise} />}
              {taxMode === "intra_state" && (
                <>
                  <Row label="CGST" value={preview.totals?.cgstPaise} />
                  <Row label="SGST" value={preview.totals?.sgstPaise} />
                </>
              )}
              {taxMode === "inter_state" && <Row label="IGST" value={preview.totals?.igstPaise} />}
              <div className="bg-primary/5 mt-1 flex items-center justify-between rounded-lg px-3 py-2.5">
                <dt className="font-semibold">Total</dt>
                <dd key={preview.totals?.totalPaise} className="animate-fade-in text-lg font-semibold tabular-nums">
                  {formatINR(preview.totals?.totalPaise ?? 0)}
                </dd>
              </div>
            </dl>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="h-10">
              {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              {documentId ? "Save changes" : kind === "quotation" ? "Save quotation" : "Save draft invoice"}
            </Button>
            <p className="text-muted-foreground text-xs">Amounts are recalculated on the server when you save.</p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", value !== undefined && value < 0 && "text-emerald-700 dark:text-emerald-400")}>
        {value === undefined ? "—" : value < 0 ? `− ${formatINR(-value)}` : formatINR(value)}
      </dd>
    </div>
  );
}
