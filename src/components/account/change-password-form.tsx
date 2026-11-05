"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { api, handleFormError } from "@/lib/client/api";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/auth";

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api("/api/account/password", { body: values });
      toast.success("Password changed. Other devices have been signed out.");
      form.reset();
      onDone?.();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
        />
        <TextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          description="At least 10 characters, including a letter and a number."
          required
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
        />
      </FieldGroup>
      <Button type="submit" disabled={form.formState.isSubmitting} className="w-fit">
        {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Change password
      </Button>
    </form>
  );
}
