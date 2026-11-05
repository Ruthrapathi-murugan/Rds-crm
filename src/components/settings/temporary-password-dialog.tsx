"use client";

import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shows a temporary password exactly once. Clicking outside does not close
 * it, so the password is not lost by accident.
 */
export function TemporaryPasswordDialog({
  password,
  userName,
  email,
  onClose,
}: {
  password: string | null;
  userName: string;
  email?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the password stays selectable on screen.
      setCopied(false);
    }
  }

  return (
    <Dialog open={password !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="bg-primary/10 text-primary mb-1 flex size-10 items-center justify-center rounded-xl">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Temporary password for {userName}</DialogTitle>
          <DialogDescription>
            Share it privately{email ? ` with ${email}` : ""}. They will be asked to choose a new password when they sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-stretch gap-2">
          <output
            aria-label="Temporary password"
            className="bg-muted flex min-w-0 flex-1 items-center rounded-lg border px-3 py-2 font-mono text-base tracking-wide break-all select-all"
          >
            {password}
          </output>
          <Button type="button" variant="outline" onClick={copy} className="h-auto shrink-0" aria-live="polite">
            {copied ? <Check className="size-4 text-emerald-600" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          This password will not be shown again. If it is lost, reset the password to get a new one.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            I have saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
