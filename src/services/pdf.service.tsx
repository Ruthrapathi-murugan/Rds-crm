import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { NotFoundError } from "@/lib/errors";
import { FinanceDocumentPdf, type PdfBank, type PdfSeller } from "@/lib/pdf/document-pdf";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { ReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { SessionUser } from "@/types";
import { sellerSnapshot } from "./finance/documents";
import { getInvoice } from "./invoice.service";
import { getPayment } from "./payment.service";
import { getQuotation } from "./quotation.service";
import { getCompanySettings, type CompanySettings } from "./settings.service";

export type PdfFile = { buffer: Buffer; filename: string };

function bankOf(settings: CompanySettings): PdfBank {
  return {
    bankName: settings.bankName,
    bankAccountName: settings.bankAccountName,
    bankAccountNumber: settings.bankAccountNumber,
    bankIfsc: settings.bankIfsc,
    upiId: settings.upiId,
  };
}

function sellerOf(settings: CompanySettings, frozen?: Omit<PdfSeller, "website" | "pan"> | null): PdfSeller {
  const base = frozen ?? sellerSnapshot(settings);
  return { ...base, website: settings.website, pan: settings.pan };
}

const fileSafe = (text: string) => text.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export async function quotationPdf(user: SessionUser, id: string): Promise<PdfFile> {
  const quotation = await getQuotation(user, id);
  if (!quotation) throw new NotFoundError("Quotation");
  const settings = await getCompanySettings();
  registerPdfFonts();
  const buffer = await renderToBuffer(
    <FinanceDocumentPdf
      kind="quotation"
      title="Quotation"
      number={quotation.quotationNumber}
      issueDate={quotation.issueDate}
      secondaryDate={quotation.validUntil}
      seller={sellerOf(settings)}
      billTo={quotation.billTo}
      placeOfSupply={quotation.billTo.state}
      taxMode={quotation.taxMode}
      items={quotation.items}
      totals={quotation.totals}
      terms={quotation.terms}
      notes={quotation.notes}
      bank={bankOf(settings)}
      stamp={quotation.storedStatus === "draft" ? "DRAFT" : null}
    />,
  );
  return { buffer, filename: `Quotation-${fileSafe(quotation.quotationNumber)}.pdf` };
}

export async function invoicePdf(user: SessionUser, id: string): Promise<PdfFile> {
  const invoice = await getInvoice(user, id);
  if (!invoice) throw new NotFoundError("Invoice");
  const settings = await getCompanySettings();
  registerPdfFonts();
  const stamp = invoice.storedStatus === "draft" ? "DRAFT" : invoice.storedStatus === "cancelled" ? "CANCELLED" : invoice.storedStatus === "paid" ? "PAID" : null;
  const buffer = await renderToBuffer(
    <FinanceDocumentPdf
      kind="invoice"
      title={invoice.storedStatus === "draft" ? `Draft ${invoice.title}` : invoice.title}
      number={invoice.invoiceNumber ?? "Not yet issued"}
      issueDate={invoice.issueDate}
      secondaryDate={invoice.dueDate}
      seller={sellerOf(settings, invoice.seller)}
      billTo={invoice.billTo}
      placeOfSupply={invoice.placeOfSupply}
      taxMode={invoice.taxMode}
      items={invoice.items}
      totals={invoice.totals}
      amountPaidPaise={invoice.amountPaidPaise}
      balancePaise={invoice.balancePaise}
      terms={invoice.terms}
      notes={invoice.notes}
      bank={bankOf(settings)}
      stamp={stamp}
    />,
  );
  return { buffer, filename: `${invoice.title.replace(" ", "-")}-${fileSafe(invoice.invoiceNumber ?? "draft")}.pdf` };
}

export async function receiptPdf(user: SessionUser, id: string): Promise<PdfFile> {
  const payment = await getPayment(user, id);
  if (!payment) throw new NotFoundError("Payment");
  const settings = await getCompanySettings();
  registerPdfFonts();
  const buffer = await renderToBuffer(
    <ReceiptPdf
      seller={sellerOf(settings)}
      paymentNumber={payment.paymentNumber}
      paidAt={payment.paidAt}
      amountPaise={payment.amountPaise}
      methodLabel={PAYMENT_METHOD_LABELS[payment.method]}
      transactionReference={payment.transactionReference}
      receivedFrom={payment.customer}
      invoiceNumber={payment.invoiceNumber}
      invoiceBalancePaise={payment.status === "recorded" ? payment.invoiceBalancePaise : null}
      projectName={payment.projectName}
      notes={payment.notes}
      voided={payment.status === "voided"}
      recordedAt={payment.createdAt}
    />,
  );
  return { buffer, filename: `Receipt-${fileSafe(payment.paymentNumber)}.pdf` };
}

/** PDF response; `inline` opens in the browser (for printing) instead of downloading. */
export function pdfResponse(file: PdfFile, inline: boolean): Response {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
