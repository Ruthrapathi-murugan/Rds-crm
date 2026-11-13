import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { AppBackground } from "@/components/layout/app-background";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/dashboard");
  return null;
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12 sm:px-8">
      <AppBackground />
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="animate-fade-up glass-panel flex w-full max-w-md flex-col gap-8 rounded-3xl p-6 sm:p-8">
        <Logo />
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
