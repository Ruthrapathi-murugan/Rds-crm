"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/constants";
import type { UserRow } from "@/services/user.service";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";
import { CreateUserSheet } from "./user-form-sheets";

export function AddUserButton({ assignableRoles }: { assignableRoles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ user: UserRow; temporaryPassword: string } | null>(null);
  if (assignableRoles.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Add user
      </Button>
      <CreateUserSheet open={open} onOpenChange={setOpen} assignableRoles={assignableRoles} onCreated={setCreated} />
      <TemporaryPasswordDialog
        password={created?.temporaryPassword ?? null}
        userName={created?.user.name ?? ""}
        email={created?.user.email}
        onClose={() => setCreated(null)}
      />
    </>
  );
}
