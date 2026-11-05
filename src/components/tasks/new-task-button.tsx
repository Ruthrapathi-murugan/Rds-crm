"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TaskFormInput } from "@/lib/validations/task";
import { emptyTask, TaskFormSheet, type TaskRelationOptions } from "./task-form-sheet";

/** Opens the task sheet, optionally pre-filled with a related customer, lead or project. */
export function NewTaskButton({
  currentUserId,
  relationOptions,
  label = "New task",
  variant = "default",
  size = "default",
}: {
  currentUserId: string;
  relationOptions?: TaskRelationOptions;
  label?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const initialValues = useMemo<TaskFormInput | undefined>(
    () =>
      relationOptions
        ? emptyTask(currentUserId, {
            customer: relationOptions.customer?.value ?? "",
            lead: relationOptions.lead?.value ?? "",
            project: relationOptions.project?.value ?? "",
          })
        : undefined,
    [relationOptions, currentUserId],
  );
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> {label}
      </Button>
      <TaskFormSheet
        open={open}
        onOpenChange={setOpen}
        currentUserId={currentUserId}
        initialValues={initialValues}
        relationOptions={relationOptions}
      />
    </>
  );
}
