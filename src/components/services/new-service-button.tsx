"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServiceFormSheet, type TaxRateChoice } from "./service-form-sheet";

export function NewServiceButton({ taxRates }: { taxRates: TaxRateChoice[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Add service
      </Button>
      <ServiceFormSheet open={open} onOpenChange={setOpen} taxRates={taxRates} />
    </>
  );
}
