import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Not found"
      description="This record doesn't exist, was archived, or you don't have access to it."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
