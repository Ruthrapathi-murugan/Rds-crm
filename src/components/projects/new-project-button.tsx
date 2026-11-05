"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Option } from "@/types";
import { EMPTY_PROJECT, ProjectFormSheet } from "./project-form-sheet";

/**
 * "New project" button. Opens straight away for `/projects?new=1`, with the
 * customer pre-selected when `&customer=<id>` is given (links from a customer page).
 */
export function NewProjectButton({ autoOpen = false, customer = null }: { autoOpen?: boolean; customer?: Option | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(autoOpen);
  const initialValues = useMemo(() => (customer ? { ...EMPTY_PROJECT, customer: customer.value } : undefined), [customer]);

  function onOpenChange(value: boolean) {
    setOpen(value);
    if (!value && (searchParams.has("new") || searchParams.has("customer"))) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      next.delete("customer");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> New project
      </Button>
      <ProjectFormSheet open={open} onOpenChange={onOpenChange} initialValues={initialValues} customerOption={customer} />
    </>
  );
}
