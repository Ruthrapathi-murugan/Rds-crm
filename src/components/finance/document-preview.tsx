import type { TaxMode } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { amountInWords } from "@/lib/utils/amount-words";
import { formatDate } from "@/lib/utils/date";
import { formatBasisPoints, formatINR } from "@/lib/utils/money";
import type { BillTo, DocumentLine, DocumentTotals } from "@/services/finance/documents";

type Seller = { name: string; address: string; gstin: string; email: string; phone: string };

/** On-screen rendering of a quotation or invoice that mirrors the PDF layout. */
export function DocumentPreview({
  title,
  number,
  issueDate,
  secondaryDate,
  secondaryLabel,
  seller,
  billTo,
  placeOfSupply,
  taxMode,
  items,
  totals,
  amountPaidPaise,
  balancePaise,
  terms,
  notes,
  stamp,
}: {
  title: string;
  number: string;
  issueDate: string;
  secondaryDate: string;
  secondaryLabel: string;
  seller: Seller;
  billTo: BillTo;
  placeOfSupply?: string;
  taxMode: TaxMode;
  items: DocumentLine[];
  totals: DocumentTotals;
  amountPaidPaise?: number;
  balancePaise?: number;
  terms: string;
  notes: string;
  stamp?: { label: string; tone: "muted" | "danger" | "success" } | null;
}) {
  const showTax = taxMode !== "none";
  return (
    <article className="bg-card relative overflow-hidden rounded-xl border shadow-sm print:border-0 print:shadow-none">
      <div className="bg-primary h-1.5" aria-hidden="true" />
      {stamp && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-[24deg] text-7xl font-black tracking-widest opacity-[0.07] select-none",
            stamp.tone === "danger" && "text-red-600 dark:text-red-400",
            stamp.tone === "success" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {stamp.label}
        </span>
      )}
      <div className="flex flex-col gap-6 p-5 sm:p-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row">
          <div className="flex flex-col gap-1">
            <p className="text-primary text-lg font-bold">{seller.name}</p>
            {seller.address && <p className="text-muted-foreground text-sm">{seller.address}</p>}
            {(seller.phone || seller.email) && (
              <p className="text-muted-foreground text-sm">{[seller.phone, seller.email].filter(Boolean).join(" · ")}</p>
            )}
            {seller.gstin && <p className="text-muted-foreground text-sm">GSTIN: {seller.gstin}</p>}
          </div>
          <div className="flex flex-col gap-1 sm:items-end sm:text-right">
            <p className="text-2xl font-bold tracking-wide uppercase">{title}</p>
            <p className="font-semibold">{number}</p>
            <p className="text-muted-foreground text-sm">Date: {formatDate(issueDate)}</p>
            <p className="text-muted-foreground text-sm">
              {secondaryLabel}: {formatDate(secondaryDate)}
            </p>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">Bill to</p>
            <p className="font-semibold">{billTo.businessName || billTo.name}</p>
            {billTo.businessName && <p className="text-sm">{billTo.name}</p>}
            <p className="text-muted-foreground text-sm">
              {[billTo.address, [billTo.city, billTo.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
            </p>
            {billTo.gstin && <p className="mt-1 text-sm font-medium">GSTIN: {billTo.gstin}</p>}
          </div>
          <div className="rounded-lg border p-4 sm:min-w-56">
            <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">Tax treatment</p>
            <p className="text-sm font-medium">
              {taxMode === "none" ? "GST not charged" : taxMode === "intra_state" ? "CGST + SGST" : "IGST"}
            </p>
            {placeOfSupply && <p className="text-muted-foreground text-sm">Place of supply: {placeOfSupply}</p>}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-primary text-primary-foreground text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Rate</th>
                <th className="px-3 py-2 text-right font-semibold">Discount</th>
                {showTax && <th className="px-3 py-2 text-right font-semibold">Taxable</th>}
                {showTax && <th className="px-3 py-2 text-right font-semibold">GST</th>}
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-t even:bg-muted/30">
                  <td className="text-muted-foreground px-3 py-2.5 align-top">{index + 1}</td>
                  <td className="px-3 py-2.5 align-top">
                    <p className="whitespace-pre-wrap">{item.description}</p>
                    {item.sacCode && <p className="text-muted-foreground text-xs">SAC/HSN {item.sacCode}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top">{item.quantity}</td>
                  <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">{formatINR(item.unitPricePaise)}</td>
                  <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">{item.discountPaise ? formatINR(item.discountPaise) : "—"}</td>
                  {showTax && <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">{formatINR(item.taxablePaise)}</td>}
                  {showTax && (
                    <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">
                      {formatINR(item.cgstPaise + item.sgstPaise + item.igstPaise)}
                      <span className="text-muted-foreground block text-xs">@ {formatBasisPoints(item.taxRateBps)}</span>
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right align-top font-medium whitespace-nowrap">{formatINR(item.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-6 sm:flex-row">
          <div className="max-w-sm">
            <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">Amount in words</p>
            <p className="text-sm font-medium">{amountInWords(totals.totalPaise)}</p>
          </div>
          <dl className="flex w-full flex-col gap-1.5 text-sm sm:w-72">
            <Line label="Subtotal" value={formatINR(totals.subtotalPaise)} />
            {totals.discountPaise > 0 && <Line label="Discount" value={`− ${formatINR(totals.discountPaise)}`} />}
            {showTax && <Line label="Taxable value" value={formatINR(totals.taxablePaise)} />}
            {taxMode === "intra_state" && <Line label="CGST" value={formatINR(totals.cgstPaise)} />}
            {taxMode === "intra_state" && <Line label="SGST" value={formatINR(totals.sgstPaise)} />}
            {taxMode === "inter_state" && <Line label="IGST" value={formatINR(totals.igstPaise)} />}
            <div className="bg-primary/5 mt-1 flex justify-between rounded-md px-3 py-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(totals.totalPaise)}</dd>
            </div>
            {amountPaidPaise !== undefined && amountPaidPaise > 0 && (
              <>
                <Line label="Amount received" value={formatINR(amountPaidPaise)} />
                <div className="flex justify-between font-semibold">
                  <dt>Balance due</dt>
                  <dd className="tabular-nums">{formatINR(balancePaise ?? 0)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {(notes || terms) && (
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            {notes && (
              <div>
                <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{notes}</p>
              </div>
            )}
            {terms && (
              <div>
                <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">Terms & conditions</p>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{terms}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
