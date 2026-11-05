import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/** RDS monogram: a rounded square in the brand primary with an "R" mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M10 23V9h6.2c3 0 5 1.8 5 4.4 0 2-1.1 3.4-2.9 4L22 23h-3.4l-3.3-5.2H13.2V23H10Zm3.2-8h2.8c1.3 0 2-.6 2-1.6s-.7-1.6-2-1.6h-2.8V15Z"
        className="fill-primary-foreground"
      />
    </svg>
  );
}

export function Logo({
  className,
  showProductName = true,
}: {
  className?: string;
  showProductName?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {showProductName && (
        <span className="flex flex-col leading-none">
          <span className="font-semibold tracking-tight">{siteConfig.productName}</span>
          <span className="text-muted-foreground text-xs">{siteConfig.companyName}</span>
        </span>
      )}
    </span>
  );
}
