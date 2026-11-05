"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LeadFormSheet } from "./lead-form-sheet";

export function NewLeadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Add lead
      </Button>
      <LeadFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
