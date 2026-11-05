"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { api, ApiClientError } from "@/lib/client/api";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

/**
 * Only same-origin paths are allowed as a post-login destination. The value is
 * parsed the way the browser will parse it (which strips tabs/newlines), so
 * tricks like "/%09/evil.example" cannot escape to another site.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || /[\x00-\x1f\\]/.test(next)) return "/dashboard";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true after a successful sign-in until the next page replaces this one.
  const [redirecting, setRedirecting] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/api/auth/login", { body: values });
      setRedirecting(true);
      router.replace(safeNext(searchParams.get("next")));
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiClientError ? error.message : "Could not sign in. Please try again.");
      form.setValue("password", "");
      form.setFocus("password");
    }
  });

  const submitting = form.formState.isSubmitting || redirecting;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && (
        <div
          role="alert"
          data-testid="login-error"
          className="animate-fade-in border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2.5 text-sm"
        >
          {formError}
        </div>
      )}
      <FieldGroup>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <InputGroup className="h-11">
                <InputGroupAddon>
                  <Mail className="size-4" aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  {...field}
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="name@company.com"
                  aria-invalid={fieldState.invalid}
                />
              </InputGroup>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link
                  href="/forgot-password"
                  className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <InputGroup className="h-11">
                <InputGroupAddon>
                  <Lock className="size-4" aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  {...field}
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" size="lg" className="group h-11 text-sm" disabled={submitting}>
        {submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        Accounts are created by your administrator.
      </p>
    </form>
  );
}
