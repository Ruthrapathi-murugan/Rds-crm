"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ComboboxField } from "@/components/forms/combobox-field";
import { MoneyField, SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { useOptions } from "@/hooks/use-options";
import { api, handleFormError } from "@/lib/client/api";
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES, optionsOf } from "@/lib/constants";
import { paiseToInput } from "@/lib/utils/money";
import { convertLeadSchema, type ConvertLeadInput } from "@/lib/validations/lead";

export function ConvertLeadDialog({
  open,
  onOpenChange,
  lead,
  canCreateProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { id: string; contactName: string; businessName: string; serviceName: string | null; interestedServiceId: string | null; estimatedValuePaise: number };
  canCreateProject: boolean;
}) {
  const router = useRouter();
  const { options: services } = useOptions(open ? "/api/services/options" : null);
  const defaults: ConvertLeadInput = {
    customerType: "small_business",
    createProject: canCreateProject,
    projectName: [lead.businessName || lead.contactName, lead.serviceName].filter(Boolean).join(" – "),
    projectService: lead.interestedServiceId ?? "",
    quotedAmount: paiseToInput(lead.estimatedValuePaise),
  };
  const form = useForm<ConvertLeadInput>({
    resolver: zodResolver(convertLeadSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const createProject = useWatch({ control: form.control, name: "createProject" });

  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await api<{ customerId: string; projectId: string | null }>(`/api/leads/${lead.id}/convert`, { body: values });
      toast.success(`${lead.contactName} is now a customer`, {
        icon: <PartyPopper className="size-4" />,
        action: { label: "View customer", onClick: () => router.push(`/customers/${result.customerId}`) },
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !form.formState.isSubmitting && onOpenChange(value)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Convert to customer</DialogTitle>
            <DialogDescription>
              Creates a customer record from this lead and marks the lead as won. This can only be done once.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <SelectField control={form.control} name="customerType" label="Customer type" options={optionsOf(CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS)} required />
            {canCreateProject && (
              <SwitchField control={form.control} name="createProject" label="Also create a project" description="Start tracking delivery right away." />
            )}
            {createProject && (
              <div className="animate-fade-in grid gap-4">
                <TextField control={form.control} name="projectName" label="Project name" required />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ComboboxField control={form.control} name="projectService" label="Service" options={services} placeholder="Choose a service" />
                  <MoneyField control={form.control} name="quotedAmount" label="Quoted amount" />
                </div>
              </div>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Convert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
