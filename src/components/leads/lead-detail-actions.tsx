"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, ChevronDown, Loader2, Pencil, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateTimeField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { api, handleFormError } from "@/lib/client/api";
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import { leadStatusSchema, type LeadFormInput, type LeadStatusInput } from "@/lib/validations/lead";
import { ConvertLeadDialog } from "./convert-lead-dialog";
import { LeadFormSheet } from "./lead-form-sheet";

export type LeadActionsProps = {
  lead: {
    id: string;
    contactName: string;
    businessName: string;
    status: LeadStatus;
    archived: boolean;
    converted: boolean;
    serviceName: string | null;
    interestedServiceId: string | null;
    estimatedValuePaise: number;
  };
  formValues: LeadFormInput;
  permissions: { write: boolean; archive: boolean; convert: boolean; createProject: boolean };
};

export function LeadDetailActions({ lead, formValues, permissions }: LeadActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<LeadStatus | null>(null);

  const statusForm = useForm<LeadStatusInput>({
    resolver: zodResolver(leadStatusSchema, undefined, { raw: true }),
    defaultValues: { status: "contacted", lostReason: "", nextFollowUpAt: "" },
  });
  const targetStatus = useWatch({ control: statusForm.control, name: "status" });

  async function setStatus(status: LeadStatus) {
    if (status === "lost" || status === "follow_up") {
      statusForm.reset({ status, lostReason: "", nextFollowUpAt: "" });
      setStatusTarget(status);
      return;
    }
    try {
      await api(`/api/leads/${lead.id}/status`, { method: "PATCH", body: { status } });
      toast.success(`Status changed to ${LEAD_STATUS_LABELS[status]}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    }
  }

  const submitStatus = statusForm.handleSubmit(async (values) => {
    try {
      await api(`/api/leads/${lead.id}/status`, { method: "PATCH", body: values });
      toast.success(`Status changed to ${LEAD_STATUS_LABELS[values.status as LeadStatus]}`);
      setStatusTarget(null);
      router.refresh();
    } catch (error) {
      handleFormError(statusForm, error);
    }
  });

  const locked = lead.converted || lead.archived;

  return (
    <>
      {permissions.convert && !lead.converted && !lead.archived && (
        <Button onClick={() => setConvertOpen(true)}>
          <UserCheck className="size-4" aria-hidden="true" /> Convert to customer
        </Button>
      )}
      {permissions.write && !locked && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Change status <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {LEAD_STATUSES.filter((s) => s !== "won" && s !== lead.status).map((status) => (
              <DropdownMenuItem key={status} onSelect={() => void setStatus(status)}>
                {LEAD_STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {permissions.write && !lead.archived && (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" aria-hidden="true" /> Edit
        </Button>
      )}
      {permissions.archive && (
        <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
          {lead.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
          {lead.archived ? "Restore" : "Archive"}
        </Button>
      )}

      <LeadFormSheet open={editOpen} onOpenChange={setEditOpen} leadId={lead.id} initialValues={formValues} converted={lead.converted} />
      <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} canCreateProject={permissions.createProject} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={lead.archived ? "Restore this lead?" : "Archive this lead?"}
        description={lead.archived ? "It will appear in the active list again." : "It will be hidden from lists but kept with its full history."}
        confirmLabel={lead.archived ? "Restore" : "Archive"}
        destructive={!lead.archived}
        onConfirm={async () => {
          await api(`/api/leads/${lead.id}/archive`, { body: { archived: !lead.archived } });
          toast.success(lead.archived ? "Lead restored" : "Lead archived");
          router.refresh();
        }}
      />

      <Dialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent>
          <form onSubmit={submitStatus} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>{targetStatus === "lost" ? "Mark lead as lost" : "Schedule follow-up"}</DialogTitle>
              <DialogDescription>
                {targetStatus === "lost"
                  ? "Recording why helps improve future conversions."
                  : "The lead will appear in follow-up lists and on the dashboard."}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              {targetStatus === "lost" ? (
                <TextField control={statusForm.control} name="lostReason" label="Reason (optional)" placeholder="e.g. Budget, chose another agency" />
              ) : (
                <DateTimeField control={statusForm.control} name="nextFollowUpAt" label="Follow up on" required />
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={statusForm.formState.isSubmitting} variant={targetStatus === "lost" ? "destructive" : "default"}>
                {statusForm.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {targetStatus === "lost" ? "Mark as lost" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
