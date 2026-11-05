"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="This page couldn't be loaded"
      description="Something went wrong while loading this page. Please try again. If it keeps happening, contact your administrator."
      action={
        <Button variant="outline" onClick={() => retry()}>
          <RotateCcw className="size-4" aria-hidden="true" /> Try again
        </Button>
      }
    />
  );
}
