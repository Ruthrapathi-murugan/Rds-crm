import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BarChart3, Globe, Hotel, Megaphone, ShieldCheck } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const highlights = [
  { icon: Globe, text: "Web development & website care" },
  { icon: Hotel, text: "Hotel & OTA management" },
  { icon: Megaphone, text: "Digital marketing, SEO & social" },
  { icon: BarChart3, text: "Revenue, receivables & reports" },
];

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/dashboard");
  return null;
}

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section
        aria-hidden="true"
        className="animate-gradient-pan relative hidden overflow-hidden bg-[linear-gradient(135deg,oklch(0.32_0.15_268),oklch(0.45_0.19_264),oklch(0.38_0.16_285))] text-white lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <div className="pointer-events-none absolute inset-0">
          <div
            className="animate-float absolute -top-24 -left-16 size-96 rounded-full bg-indigo-300/25 blur-3xl"
            style={{ "--float-x": "40px", "--float-y": "30px" } as React.CSSProperties}
          />
          <div
            className="animate-float absolute right-[-6rem] bottom-[-4rem] size-[28rem] rounded-full bg-sky-300/20 blur-3xl"
            style={{ "--float-duration": "18s", "--float-x": "-30px", "--float-y": "-40px" } as React.CSSProperties}
          />
          <div
            className="animate-float absolute top-1/2 left-1/2 size-64 rounded-full bg-violet-300/20 blur-3xl"
            style={{ "--float-duration": "22s" } as React.CSSProperties}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:28px_28px]" />
        </div>

        <div className="relative flex items-center gap-3">
          <span className="rounded-xl bg-white/10 p-1 ring-1 ring-white/20 backdrop-blur">
            <LogoMark className="size-9" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">{siteConfig.productName}</p>
            <p className="text-sm text-white/70">{siteConfig.companyName}</p>
          </div>
        </div>

        <div className="relative flex max-w-md flex-col gap-8">
          <div className="animate-fade-up flex flex-col gap-4">
            <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
              Every lead, project and rupee — in one place.
            </h2>
            <p className="text-pretty text-white/75">
              Follow up on time, deliver projects on schedule and know exactly what is paid and what is due.
            </p>
          </div>
          <ul className="stagger flex flex-col gap-3">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="size-4" /> Private system for authorised staff · {siteConfig.location}
        </p>
      </section>

      {/* Form */}
      <section className="bg-app flex items-center justify-center px-4 py-12 sm:px-8">
        <Suspense fallback={null}>
          <RedirectIfSignedIn />
        </Suspense>
        <div className="animate-fade-up flex w-full max-w-sm flex-col gap-8">
          <Logo className="lg:hidden" />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground text-sm">Sign in to your RDS CRM account.</p>
          </div>
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
