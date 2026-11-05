"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { FormSheet } from "@/components/forms/form-sheet";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, handleFormError } from "@/lib/client/api";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/lib/validations/auth";
import type { UserRow } from "@/services/user.service";

const ROLE_HELP: Record<Role, string> = {
  super_admin: "Full access, including other admins.",
  admin: "Full access; manages managers and staff.",
  manager: "All records, finance and reports. No settings or users.",
  staff: "Own leads, customers, projects and tasks only.",
};

function roleOptions(roles: readonly Role[]) {
  return roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
}

export function CreateUserSheet({
  open,
  onOpenChange,
  assignableRoles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignableRoles: readonly Role[];
  onCreated: (result: { user: UserRow; temporaryPassword: string }) => void;
}) {
  const router = useRouter();
  const defaults: CreateUserInput = { name: "", email: "", phone: "", role: assignableRoles.includes("staff") ? "staff" : assignableRoles[0] };
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const role = useWatch({ control: form.control, name: "role" });

  useEffect(() => {
    if (open) form.reset(defaults);
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await api<{ user: UserRow; temporaryPassword: string }>("/api/users", { body: values });
      toast.success(`${result.user.name} added`);
      onOpenChange(false);
      onCreated(result);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add user"
      description="A temporary password is generated; they choose their own at first sign-in."
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel="Add user"
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Full name" required autoComplete="off" />
        <TextField control={form.control} name="email" label="Email" type="email" required autoComplete="off" description="Used to sign in." />
        <TextField control={form.control} name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="off" />
        <SelectField
          control={form.control}
          name="role"
          label="Role"
          options={roleOptions(assignableRoles)}
          required
          description={role ? ROLE_HELP[role as Role] : undefined}
        />
      </FieldGroup>
    </FormSheet>
  );
}

export function EditUserSheet({
  open,
  onOpenChange,
  user,
  assignableRoles,
  isSelf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRow;
  assignableRoles: readonly Role[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema, undefined, { raw: true }),
    defaultValues: { name: user.name, phone: user.phone, role: user.role, isActive: user.isActive },
  });
  const role = useWatch({ control: form.control, name: "role" });
  const options = assignableRoles.includes(user.role) ? assignableRoles : [user.role, ...assignableRoles];

  useEffect(() => {
    if (open) form.reset({ name: user.name, phone: user.phone, role: user.role, isActive: user.isActive });
  }, [open, user, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api(`/api/users/${user.id}`, { method: "PATCH", body: values });
      toast.success(`${values.name} updated`);
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${user.name}`}
      description="Changing the role or deactivating signs the user out everywhere."
      onSubmit={onSubmit}
      submitting={form.formState.isSubmitting}
      submitLabel="Save changes"
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Full name" required autoComplete="off" />
        <Field>
          <FieldLabel htmlFor="edit-user-email">Email</FieldLabel>
          <Input id="edit-user-email" value={user.email} readOnly disabled />
          <FieldDescription>The sign-in email cannot be changed.</FieldDescription>
        </Field>
        <TextField control={form.control} name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="off" />
        <SelectField
          control={form.control}
          name="role"
          label="Role"
          options={roleOptions(options)}
          required
          disabled={isSelf}
          description={isSelf ? "You cannot change your own role." : role ? ROLE_HELP[role as Role] : undefined}
        />
        <SwitchField
          control={form.control}
          name="isActive"
          label="Active"
          disabled={isSelf}
          description={isSelf ? "You cannot deactivate yourself." : "Inactive users cannot sign in. Their records are kept."}
        />
      </FieldGroup>
    </FormSheet>
  );
}
