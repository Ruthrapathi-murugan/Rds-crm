"use client";

import { Pencil, Power, PowerOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { invalidateOptions } from "@/hooks/use-options";
import { api } from "@/lib/client/api";
import type { ServiceFormInput } from "@/lib/validations/service";
import { ServiceFormSheet, type TaxRateChoice } from "./service-form-sheet";

export function ServiceCardActions({
  service,
  formValues,
  taxRates,
}: {
  service: { id: string; name: string; isActive: boolean; usage: number };
  formValues: ServiceFormInput;
  taxRates: TaxRateChoice[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} aria-label={`Edit ${service.name}`}>
        <Pencil className="size-3.5" aria-hidden="true" /> Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className={service.isActive ? "text-muted-foreground hover:text-destructive" : "text-primary"}
        aria-label={`${service.isActive ? "Deactivate" : "Activate"} ${service.name}`}
      >
        {service.isActive ? <PowerOff className="size-3.5" aria-hidden="true" /> : <Power className="size-3.5" aria-hidden="true" />}
        {service.isActive ? "Deactivate" : "Activate"}
      </Button>

      <ServiceFormSheet open={editOpen} onOpenChange={setEditOpen} serviceId={service.id} initialValues={formValues} taxRates={taxRates} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={service.isActive ? `Deactivate ${service.name}?` : `Activate ${service.name}?`}
        description={
          service.isActive
            ? `It will no longer be offered on new leads, projects, quotations or invoices.${
                service.usage ? ` The ${service.usage} existing record${service.usage === 1 ? "" : "s"} using it stay unchanged.` : ""
              } You can activate it again at any time.`
            : "It will be offered again on new leads, projects, quotations and invoices."
        }
        confirmLabel={service.isActive ? "Deactivate" : "Activate"}
        destructive={service.isActive}
        onConfirm={async () => {
          await api(`/api/services/${service.id}`, { method: "PATCH", body: { isActive: !service.isActive } });
          invalidateOptions("/api/services");
          toast.success(service.isActive ? `${service.name} deactivated` : `${service.name} activated`);
          router.refresh();
        }}
      />
    </div>
  );
}
