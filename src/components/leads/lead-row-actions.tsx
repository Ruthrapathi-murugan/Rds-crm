"use client";

import { Archive, ArchiveRestore, ExternalLink, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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

export function LeadRowActions({
  id,
  name,
  archived,
  canArchive,
}: {
  id: string;
  name: string;
  archived: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function toggleArchive() {
    await api(`/api/leads/${id}/archive`, { body: { archived: !archived } });
    toast.success(archived ? `${name} restored` : `${name} archived`);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/leads/${id}`}>
              <ExternalLink aria-hidden="true" /> Open
            </Link>
          </DropdownMenuItem>
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmOpen(true)} variant={archived ? "default" : "destructive"}>
                {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                {archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={archived ? `Restore ${name}?` : `Archive ${name}?`}
        description={
          archived
            ? "The lead will appear in the active list again."
            : "Archived leads are hidden from lists and the dashboard but kept with their full history. You can restore them later."
        }
        confirmLabel={archived ? "Restore" : "Archive"}
        destructive={!archived}
        onConfirm={toggleArchive}
      />
    </>
  );
}
