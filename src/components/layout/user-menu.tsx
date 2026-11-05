"use client";

import { KeyRound, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { api, toastError } from "@/lib/client/api";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function signOut() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    toastError(error);
  } finally {
    window.location.replace("/login");
  }
}

export function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
          <span className="text-primary text-xs font-medium">{ROLE_LABELS[role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User aria-hidden="true" /> My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account#password">
            <KeyRound aria-hidden="true" /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            setSigningOut(true);
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
