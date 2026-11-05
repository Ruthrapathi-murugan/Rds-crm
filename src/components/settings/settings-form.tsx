"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Hash, Info, Landmark, Loader2, Percent, Plus, ReceiptText, ScrollText, Trash2, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { api, handleFormError } from "@/lib/client/api";
import { INDIAN_STATE_NAMES } from "@/lib/constants";
import { DOCUMENT_PREFIX_PATTERN, financialYear, formatDocumentNumber } from "@/lib/finance/numbering";
import { cn } from "@/lib/utils";
import { companySettingsSchema, type CompanySettingsInput } from "@/lib/validations/settings";
import type { CompanySettings } from "@/services/settings.service";
import { settingsToFormValues } from "./settings-values";

const MAX_TAX_RATES = 20;
const stateOptions = INDIAN_STATE_NAMES.map((name) => ({ value: name, label: name }));

function Section({
  icon: Icon,
  title,
  description,
  children,
  id,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <Card aria-labelledby={`${id}-title`} role="region" className="scroll-mt-20">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-4.5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle id={`${id}-title`}>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warning" }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        tone === "info" ? "border-primary/20 bg-primary/5" : "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      <Info className={cn("mt-0.5 size-4 shrink-0", tone === "info" ? "text-primary" : "text-amber-600")} aria-hidden="true" />
      <div className="flex flex-col gap-1 text-pretty">{children}</div>
    </div>
  );
}

function NumberPreview({ control, name, label }: { control: Control<CompanySettingsInput>; name: "invoicePrefix" | "quotationPrefix"; label: string }) {
  const prefix = (useWatch({ control, name }) ?? "").trim();
  // Computed in the browser at render time; the server assigns real numbers.
  const fy = useMemo(() => financialYear(new Date()), []);
  const preview = DOCUMENT_PREFIX_PATTERN.test(prefix) ? formatDocumentNumber(prefix, fy, 1) : null;
  return (
    <p className="text-muted-foreground text-xs">
      {label}:{" "}
      {preview ? (
        <span className="text-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-xs font-medium">{preview}</span>
      ) : (
        <span>enter 1–5 letters or digits</span>
      )}
    </p>
  );
}

function TaxRatesEditor({ control }: { control: Control<CompanySettingsInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "taxRates", keyName: "key" });
  const baseId = useId();
  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          No tax rates yet. Add the rates your business charges.
        </p>
      ) : (
        <>
          <div className="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_8rem_5.5rem_2.25rem] gap-3 px-1 text-xs font-medium sm:grid">
            <span>Label</span>
            <span>Rate</span>
            <span>Active</span>
            <span className="sr-only">Remove</span>
          </div>
          <ul className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <li
                key={field.key}
                className="animate-fade-in grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_2.25rem] sm:items-start sm:border-0 sm:p-0"
              >
                <Controller
                  control={control}
                  name={`taxRates.${index}.label`}
                  render={({ field: f, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="col-span-2 sm:col-span-1">
                      <FieldLabel htmlFor={`${baseId}-label-${index}`} className="sm:sr-only">
                        Label
                      </FieldLabel>
                      <Input
                        {...f}
                        id={`${baseId}-label-${index}`}
                        value={f.value ?? ""}
                        placeholder="e.g. GST 18%"
                        maxLength={60}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`taxRates.${index}.rate`}
                  render={({ field: f, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${baseId}-rate-${index}`} className="sm:sr-only">
                        Rate
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          {...f}
                          id={`${baseId}-rate-${index}`}
                          value={String(f.value ?? "")}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                          aria-invalid={fieldState.invalid}
                          className="tabular-nums"
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>%</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`taxRates.${index}.isActive`}
                  render={({ field: f }) => (
                    <div className="flex flex-col gap-2 sm:h-9 sm:flex-row sm:items-center">
                      <label htmlFor={`${baseId}-active-${index}`} className="text-sm font-medium sm:sr-only">
                        Active
                      </label>
                      <Switch
                        id={`${baseId}-active-${index}`}
                        checked={f.value !== false}
                        onCheckedChange={f.onChange}
                        onBlur={f.onBlur}
                      />
                    </div>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive col-start-2 row-start-2 self-end sm:col-start-auto sm:row-start-auto sm:self-start"
                  onClick={() => remove(index)}
                  aria-label={`Remove tax rate ${index + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ label: "", rate: "", isActive: true })}
          disabled={fields.length >= MAX_TAX_RATES}
        >
          <Plus className="size-4" aria-hidden="true" /> Add tax rate
        </Button>
        <span className="text-muted-foreground text-xs">
          {fields.length} of {MAX_TAX_RATES}
        </span>
      </div>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: CompanySettings }) {
  const router = useRouter();
  const defaultValues = useMemo(() => settingsToFormValues(initial), [initial]);
  const form = useForm<CompanySettingsInput>({
    resolver: zodResolver(companySettingsSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { isDirty, isSubmitting } = form.formState;
  const gstRegistered = useWatch({ control: form.control, name: "gstRegistered" });

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const onSubmit = form.handleSubmit(
    async (values) => {
      try {
        const saved = await api<CompanySettings>("/api/settings", { method: "PUT", body: values });
        form.reset(settingsToFormValues(saved));
        toast.success("Settings saved");
        router.refresh();
      } catch (error) {
        handleFormError(form, error);
      }
    },
    () => toast.error("Please check the highlighted fields."),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 [&_button]:scroll-mb-28 [&_input]:scroll-mb-28 [&_textarea]:scroll-mb-28" aria-label="Company settings">
      <div className="stagger flex flex-col gap-6">
        <Section id="business" icon={Building2} title="Business details" description="Shown on quotations, invoices and emails.">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="companyName" label="Business name" required autoComplete="organization" />
              <TextField control={form.control} name="legalName" label="Legal name" description="If different from the business name." />
              <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
              <TextField control={form.control} name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" />
              <TextField control={form.control} name="website" label="Website" placeholder="www.example.com" className="sm:col-span-2" />
              <TextField control={form.control} name="addressLine1" label="Address line 1" autoComplete="address-line1" />
              <TextField control={form.control} name="addressLine2" label="Address line 2" autoComplete="address-line2" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="city" label="City" autoComplete="address-level2" />
              <SelectField
                control={form.control}
                name="state"
                label="State"
                options={stateOptions}
                noneLabel="Not set"
                required={gstRegistered}
                description="Decides CGST + SGST or IGST on invoices."
              />
              <TextField control={form.control} name="pincode" label="PIN code" inputMode="numeric" maxLength={6} autoComplete="postal-code" />
            </div>
          </FieldGroup>
        </Section>

        <Section id="gst" icon={ReceiptText} title="GST & tax" description="Registration details printed on your documents.">
          <FieldGroup>
            <SwitchField
              control={form.control}
              name="gstRegistered"
              label="GST registered"
              description="Turn on only if the business holds a valid GST registration."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="gstin"
                label="GSTIN"
                required={gstRegistered}
                placeholder="33ABCDE1234F1Z5"
                maxLength={15}
                autoComplete="off"
                description={gstRegistered ? "Required while GST registered." : "Leave empty if not registered."}
              />
              <TextField control={form.control} name="pan" label="PAN" placeholder="ABCDE1234F" maxLength={10} autoComplete="off" />
            </div>
            <Note>
              <p>
                Invoices are titled <strong>“Tax Invoice”</strong> only when the business is GST registered with a GSTIN{" "}
                <em>and</em> the invoice charges GST. Every other invoice is titled <strong>“Invoice”</strong>.
              </p>
              <p className="text-muted-foreground">
                The rates below are editable starting points, not tax advice. Confirm the rates and SAC codes that apply to
                your services with your tax adviser.
              </p>
            </Note>
          </FieldGroup>
        </Section>

        <Section
          id="tax-rates"
          icon={Percent}
          title="Tax rates"
          description="Choices offered on quotation and invoice lines. Inactive rates stay on old documents but are hidden from new ones."
        >
          <TaxRatesEditor control={form.control} />
        </Section>

        <Section id="bank" icon={Landmark} title="Bank & UPI" description="Payment details printed on invoices.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="bankAccountName" label="Account name" autoComplete="off" />
            <TextField control={form.control} name="bankName" label="Bank name" autoComplete="off" />
            <TextField control={form.control} name="bankAccountNumber" label="Account number" inputMode="numeric" autoComplete="off" maxLength={20} />
            <TextField control={form.control} name="bankIfsc" label="IFSC" placeholder="SBIN0001234" maxLength={11} autoComplete="off" />
            <TextField control={form.control} name="upiId" label="UPI ID" placeholder="business@okbank" autoComplete="off" />
          </div>
        </Section>

        <Section id="numbering" icon={Hash} title="Document numbering" description="Prefixes for invoice and quotation numbers.">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <TextField control={form.control} name="invoicePrefix" label="Invoice prefix" required maxLength={5} autoComplete="off" />
                <NumberPreview control={form.control} name="invoicePrefix" label="Next invoice looks like" />
              </div>
              <div className="flex flex-col gap-2">
                <TextField control={form.control} name="quotationPrefix" label="Quotation prefix" required maxLength={5} autoComplete="off" />
                <NumberPreview control={form.control} name="quotationPrefix" label="Next quotation looks like" />
              </div>
            </div>
            <Note>
              <p>
                Numbers follow the Indian financial year and restart at 0001 every 1 April. Invoices get a number only when
                they are issued, so drafts never leave gaps in the series.
              </p>
            </Note>
          </FieldGroup>
        </Section>

        <Section id="defaults" icon={ScrollText} title="Defaults" description="Pre-filled on new quotations and invoices; each document can change them.">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField control={form.control} name="defaultPaymentTermsDays" label="Payment terms" min={0} max={365} suffix="days" required description="Invoice due date = issue date + this many days." />
              <NumberField control={form.control} name="defaultQuotationValidityDays" label="Quotation validity" min={1} max={365} suffix="days" required />
            </div>
            <TextareaField control={form.control} name="quotationTerms" label="Quotation terms" rows={5} maxLength={5000} />
            <TextareaField control={form.control} name="invoiceTerms" label="Invoice terms" rows={4} maxLength={5000} />
          </FieldGroup>
        </Section>
      </div>

      {isDirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="animate-fade-up bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
            You have unsaved changes
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => form.reset()} disabled={isSubmitting}>
              Discard
            </Button>
            <Button type="submit" className="flex-1 sm:flex-none" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
