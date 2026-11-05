import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Download the PDF, or open it inline in a new tab for printing. */
export function PdfButtons({ href, label = "PDF" }: { href: string; label?: string }) {
  return (
    <>
      <Button asChild variant="outline">
        <a href={href} download>
          <Download className="size-4" aria-hidden="true" /> {label}
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={`${href}?inline=1`} target="_blank" rel="noopener noreferrer">
          <Printer className="size-4" aria-hidden="true" /> Print
        </a>
      </Button>
    </>
  );
}
