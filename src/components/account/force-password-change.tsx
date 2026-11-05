"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/components/layout/user-menu";
import { ChangePasswordForm } from "./change-password-form";

/** Shown instead of the app until a temporary password is replaced. */
export function ForcePasswordChange({ name }: { name: string }) {
  const router = useRouter();
  return (
    <main className="bg-app flex min-h-svh items-center justify-center px-4 py-10">
      <div className="animate-fade-up flex w-full max-w-md flex-col gap-6">
        <Logo />
        <Card>
          <CardHeader>
            <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-xl">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <CardTitle>Welcome, {name.split(" ")[0]}</CardTitle>
            <CardDescription>
              You signed in with a temporary password. Choose your own password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm onDone={() => router.refresh()} />
          </CardContent>
        </Card>
        <Button variant="link" className="w-fit self-center" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
