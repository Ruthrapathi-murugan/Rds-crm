import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

export function AccessDenied({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this page"
      description={message ?? "Ask an administrator if you need access to this area."}
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
