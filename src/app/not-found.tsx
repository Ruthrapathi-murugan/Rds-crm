import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <main className="bg-app flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <LogoMark className="animate-pop size-12" />
      <div className="animate-fade-up flex flex-col gap-2">
        <p className="text-primary text-sm font-semibold">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          The page you are looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </main>
  );
}
