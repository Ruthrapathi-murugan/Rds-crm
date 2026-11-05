"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomerFormSheet } from "./customer-form-sheet";

export function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Add customer
      </Button>
      <CustomerFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
