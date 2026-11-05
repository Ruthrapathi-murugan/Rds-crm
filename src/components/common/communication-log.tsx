"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, MessageCircle, MessageSquareText, Phone, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DateTimeField, SelectField, TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { api, handleFormError } from "@/lib/client/api";
import {
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_TYPES,
  optionsOf,
  type CommunicationType,
} from "@/lib/constants";
import { formatDateTime, toDateTimeInputValue } from "@/lib/utils/date";
import { communicationFormSchema, type CommunicationFormInput } from "@/lib/validations/lead";

export type CommunicationItem = {
  id: string;
  type: CommunicationType;
  summary: string;
  occurredAt: string;
  createdByName: string;
};

const ICONS: Record<CommunicationType, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  note: MessageSquareText,
};

/**
 * Communication history with a "log interaction" dialog. Used by leads and
 * customers; `endpoint` receives the POST.
 */
export function CommunicationLog({
  items,
  endpoint,
  canWrite,
  allowFollowUp = true,
}: {
  items: CommunicationItem[];
  endpoint: string;
  canWrite: boolean;
  allowFollowUp?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<CommunicationFormInput>({
    resolver: zodResolver(communicationFormSchema, undefined, { raw: true }),
    defaultValues: { type: "call", summary: "", occurredAt: "", nextFollowUpAt: "" },
  });

  function openDialog() {
    form.reset({ type: "call", summary: "", occurredAt: toDateTimeInputValue(new Date()), nextFollowUpAt: "" });
    setOpen(true);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api(endpoint, { body: values });
      toast.success("Interaction logged");
      setOpen(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <Button variant="outline" size="sm" className="w-fit" onClick={openDialog}>
          <Plus className="size-4" aria-hidden="true" /> Log interaction
        </Button>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No calls, messages or meetings logged yet.</p>
      ) : (
        <ol className="stagger flex flex-col gap-3">
          {items.map((item) => {
            const Icon = ICONS[item.type];
            return (
              <li key={item.id} className="bg-muted/30 flex gap-3 rounded-lg border p-3">
                <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-medium">
                    {COMMUNICATION_TYPE_LABELS[item.type]}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {formatDateTime(item.occurredAt)} · {item.createdByName}
                    </span>
                  </p>
                  <p className="text-sm break-words whitespace-pre-wrap">{item.summary}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={open} onOpenChange={(value) => !form.formState.isSubmitting && setOpen(value)}>
        <DialogContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Log interaction</DialogTitle>
              <DialogDescription>Record a call, message, email or meeting.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField control={form.control} name="type" label="Type" options={optionsOf(COMMUNICATION_TYPES, COMMUNICATION_TYPE_LABELS)} required />
                <DateTimeField control={form.control} name="occurredAt" label="When" required />
              </div>
              <TextareaField control={form.control} name="summary" label="Summary" rows={4} required maxLength={2000} placeholder="What was discussed? Any next steps?" />
              {allowFollowUp && (
                <DateTimeField control={form.control} name="nextFollowUpAt" label="Next follow-up (optional)" />
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
