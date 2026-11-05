"use client";

import { Archive, ArchiveRestore, ChevronDown, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/client/api";
import type { ProjectStatus } from "@/lib/constants";
import type { ProjectFormInput } from "@/lib/validations/project";
import type { Option } from "@/types";
import { ProjectFormSheet } from "./project-form-sheet";
import { ProjectStatusMenuItems } from "./project-status-menu-items";
import { useProjectStatus } from "./use-project-status";

export function ProjectDetailActions({
  project,
  formValues,
  customerOption,
  permissions,
}: {
  project: { id: string; name: string; status: ProjectStatus; archived: boolean };
  formValues: ProjectFormInput;
  customerOption: Option;
  permissions: { write: boolean; archive: boolean };
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { changeStatus, pending } = useProjectStatus();

  return (
    <>
      {permissions.write && !project.archived && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Change status <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <ProjectStatusMenuItems current={project.status} onSelect={(status) => changeStatus(project.id, status)} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {permissions.write && !project.archived && (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" aria-hidden="true" /> Edit
        </Button>
      )}
      {permissions.archive && (
        <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
          {project.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
          {project.archived ? "Restore" : "Archive"}
        </Button>
      )}

      <ProjectFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={project.id}
        initialValues={formValues}
        customerOption={customerOption}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={project.archived ? "Restore this project?" : "Archive this project?"}
        description={
          project.archived
            ? "It will appear in the project list and board again."
            : "It will be hidden from lists and the board but kept with its full history."
        }
        confirmLabel={project.archived ? "Restore" : "Archive"}
        destructive={!project.archived}
        onConfirm={async () => {
          await api(`/api/projects/${project.id}/archive`, { body: { archived: !project.archived } });
          toast.success(project.archived ? "Project restored" : "Project archived");
          router.refresh();
        }}
      />
    </>
  );
}
