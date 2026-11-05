"use client";

import { Archive, ArchiveRestore, ArrowRightLeft, ExternalLink, MoreHorizontal } from "lucide-react";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/client/api";
import type { ProjectStatus } from "@/lib/constants";
import { ProjectStatusMenuItems } from "./project-status-menu-items";
import { useProjectStatus } from "./use-project-status";

export function ProjectRowActions({
  id,
  name,
  status,
  archived,
  canWrite,
  canArchive,
}: {
  id: string;
  name: string;
  status: ProjectStatus;
  archived: boolean;
  canWrite: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { changeStatus } = useProjectStatus();

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
            <Link href={`/projects/${id}`}>
              <ExternalLink aria-hidden="true" /> Open
            </Link>
          </DropdownMenuItem>
          {canWrite && !archived && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft aria-hidden="true" /> Change status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <ProjectStatusMenuItems current={status} onSelect={(s) => changeStatus(id, s)} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
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
            ? "The project will appear in the active list again."
            : "Archived projects are hidden from lists and the board but kept with their full history. You can restore them later."
        }
        confirmLabel={archived ? "Restore" : "Archive"}
        destructive={!archived}
        onConfirm={async () => {
          await api(`/api/projects/${id}/archive`, { body: { archived: !archived } });
          toast.success(archived ? `${name} restored` : `${name} archived`);
          router.refresh();
        }}
      />
    </>
  );
}
