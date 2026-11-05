"use client";

import { KeyRound, MoreHorizontal, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/client/api";
import type { Role } from "@/lib/constants";
import type { UserRow } from "@/services/user.service";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";
import { EditUserSheet } from "./user-form-sheets";

export function UserRowActions({
  user,
  isSelf,
  assignableRoles,
}: {
  user: UserRow;
  isSelf: boolean;
  assignableRoles: Role[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  async function resetPassword() {
    const result = await api<{ temporaryPassword: string }>(`/api/users/${user.id}/reset-password`, { method: "POST" });
    setPassword(result.temporaryPassword);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil aria-hidden="true" /> Edit
          </DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmOpen(true)} variant="destructive">
                <KeyRound aria-hidden="true" /> Reset password
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <EditUserSheet open={editOpen} onOpenChange={setEditOpen} user={user} assignableRoles={assignableRoles} isSelf={isSelf} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Reset ${user.name}'s password?`}
        description="Their current password stops working immediately and they are signed out on every device. You will get a temporary password to share with them."
        confirmLabel="Reset password"
        destructive
        onConfirm={resetPassword}
      />
      <TemporaryPasswordDialog password={password} userName={user.name} email={user.email} onClose={() => setPassword(null)} />
    </>
  );
}
