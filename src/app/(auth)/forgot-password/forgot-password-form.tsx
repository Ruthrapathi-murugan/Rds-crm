"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { api, ApiClientError } from "@/lib/client/api";
import {
  forgotPasswordSchema,
  newPasswordPairSchema,
  verifyOtpSchema,
  type ForgotPasswordInput,
  type NewPasswordPairInput,
} from "@/lib/validations/auth";

type Step = "email" | "otp" | "password" | "done";

const RESEND_COOLDOWN_SECONDS = 60;
const otpOnlySchema = verifyOtpSchema.pick({ otp: true });

const STEP_TEXT: Record<Step, { title: string; description: string }> = {
  email: {
    title: "Forgot your password?",
    description: "Enter your account email and we will send you a 6-digit code to reset it.",
  },
  otp: { title: "Check your email", description: "Enter the 6-digit code we sent. It expires in 5 minutes." },
  password: { title: "Choose a new password", description: "Use at least 10 characters with a letter and a number." },
  done: { title: "Password updated", description: "You can now sign in with your new password." },
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="animate-fade-in border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2.5 text-sm"
    >
      {message}
    </div>
  );
}

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const text = STEP_TEXT[step];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{text.title}</h1>
        <p className="text-muted-foreground text-sm">{text.description}</p>
      </div>

      {step === "email" && (
        <EmailStep
          defaultEmail={email}
          initialError={expired ? "Your reset session expired or was already used. Please request a new code." : null}
          onSent={(sentTo) => {
            setExpired(false);
            setEmail(sentTo);
            setCooldown(RESEND_COOLDOWN_SECONDS);
            setStep("otp");
          }}
        />
      )}
      {step === "otp" && (
        <OtpStep
          email={email}
          cooldown={cooldown}
          onResent={() => setCooldown(RESEND_COOLDOWN_SECONDS)}
          onChangeEmail={() => setStep("email")}
          onVerified={(token) => {
            setResetToken(token);
            setStep("password");
          }}
        />
      )}
      {step === "password" && (
        <PasswordStep
          email={email}
          resetToken={resetToken}
          onExpired={() => {
            setResetToken("");
            setExpired(true);
            setStep("email");
          }}
          onDone={() => {
            setResetToken("");
            setStep("done");
          }}
        />
      )}
      {step === "done" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 rounded-lg border border-emerald-600/25 bg-emerald-600/5 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
            You have been signed out on all devices for security.
          </div>
          <Button asChild size="lg" className="h-11 text-sm">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      )}

      {step !== "done" && (
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to sign in
        </Link>
      )}
    </div>
  );
}

function EmailStep({
  defaultEmail,
  initialError,
  onSent,
}: {
  defaultEmail: string;
  initialError: string | null;
  onSent: (email: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(initialError);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: defaultEmail },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/api/auth/forgot-password", { body: values });
      onSent(values.email.trim().toLowerCase());
    } catch (error) {
      setFormError(errorMessage(error, "Could not send the code. Please try again."));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormAlert message={formError} />
      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="reset-email">Email</FieldLabel>
            <InputGroup className="h-11">
              <InputGroupAddon>
                <Mail className="size-4" aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                {...field}
                id="reset-email"
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
      <Button type="submit" size="lg" className="h-11 text-sm" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4" aria-hidden="true" />
        )}
        {form.formState.isSubmitting ? "Sending code…" : "Send code"}
      </Button>
    </form>
  );
}

function OtpStep({
  email,
  cooldown,
  onResent,
  onChangeEmail,
  onVerified,
}: {
  email: string;
  cooldown: number;
  onResent: () => void;
  onChangeEmail: () => void;
  onVerified: (resetToken: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const form = useForm<{ otp: string }>({
    resolver: zodResolver(otpOnlySchema),
    defaultValues: { otp: "" },
  });

  const onSubmit = form.handleSubmit(async ({ otp }) => {
    setFormError(null);
    setNotice(null);
    try {
      const data = await api<{ resetToken: string }>("/api/auth/verify-otp", { body: { email, otp } });
      onVerified(data.resetToken);
    } catch (error) {
      setFormError(errorMessage(error, "Could not verify the code. Please try again."));
      form.setValue("otp", "");
      form.setFocus("otp");
    }
  });

  async function resend() {
    setFormError(null);
    setNotice(null);
    setResending(true);
    try {
      await api("/api/auth/forgot-password", { body: { email } });
      onResent();
      setNotice("If an account exists for this email, a new code has been sent. Earlier codes no longer work.");
      form.setValue("otp", "");
    } catch (error) {
      setFormError(errorMessage(error, "Could not resend the code. Please try again."));
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormAlert message={formError} />
      {notice && (
        <p role="status" className="bg-muted text-muted-foreground rounded-lg px-3 py-2.5 text-sm">
          {notice}
        </p>
      )}
      <FieldGroup>
        <Controller
          control={form.control}
          name="otp"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="reset-otp">6-digit code</FieldLabel>
              <InputGroup className="h-12">
                <InputGroupAddon>
                  <KeyRound className="size-4" aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  id="reset-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="••••••"
                  className="font-mono text-lg tracking-[0.5em]"
                  aria-invalid={fieldState.invalid}
                />
              </InputGroup>
              <FieldDescription>
                Sent to <span className="text-foreground font-medium">{email}</span> if it belongs to an account.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" size="lg" className="h-11 text-sm" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4" aria-hidden="true" />
        )}
        {form.formState.isSubmitting ? "Verifying…" : "Verify code"}
      </Button>
      <div className="flex items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" size="sm" onClick={onChangeEmail}>
          Use a different email
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={resend} disabled={cooldown > 0 || resending}>
          {resending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </div>
    </form>
  );
}

function PasswordStep({
  email,
  resetToken,
  onExpired,
  onDone,
}: {
  email: string;
  resetToken: string;
  onExpired: () => void;
  onDone: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<NewPasswordPairInput>({
    resolver: zodResolver(newPasswordPairSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/api/auth/reset-password", { body: { email, resetToken, ...values } });
      onDone();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 400 && !error.fieldErrors) {
        // The reset token expired or was already used: the user must start again.
        onExpired();
        return;
      }
      if (error instanceof ApiClientError && error.fieldErrors) {
        for (const [name, messages] of Object.entries(error.fieldErrors)) {
          if (name === "newPassword" || name === "confirmPassword") {
            form.setError(name, { type: "server", message: messages[0] });
          }
        }
      }
      setFormError(errorMessage(error, "Could not reset the password. Please try again."));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormAlert message={formError} />
      <FieldGroup>
        {(["newPassword", "confirmPassword"] as const).map((name) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`reset-${name}`}>
                  {name === "newPassword" ? "New password" : "Confirm new password"}
                </FieldLabel>
                <InputGroup className="h-11">
                  <InputGroupAddon>
                    <Lock className="size-4" aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    {...field}
                    id={`reset-${name}`}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    autoFocus={name === "newPassword"}
                    aria-invalid={fieldState.invalid}
                  />
                  {name === "newPassword" && (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  )}
                </InputGroup>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      <Button type="submit" size="lg" className="h-11 text-sm" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        )}
        {form.formState.isSubmitting ? "Saving…" : "Reset password"}
      </Button>
    </form>
  );
}
