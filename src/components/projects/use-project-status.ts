"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { api, toastError } from "@/lib/client/api";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/constants";

/** Calls the status API and refreshes the page; exposes a pending flag for spinners. */
export function useProjectStatus() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeStatus(id: string, status: ProjectStatus, onOptimistic?: () => void) {
    startTransition(async () => {
      onOptimistic?.();
      try {
        await api(`/api/projects/${id}/status`, { method: "PATCH", body: { status } });
        toast.success(`Moved to ${PROJECT_STATUS_LABELS[status]}`);
        router.refresh();
      } catch (error) {
        toastError(error);
      }
    });
  }

  return { changeStatus, pending };
}
