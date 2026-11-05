import { apiRoute, parseBody } from "@/lib/api/handler";
import { renderEmail } from "@/lib/email-templates";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { formatDate } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import { emailDocumentSchema } from "@/lib/validations/finance";
import { getInvoice, markInvoiceEmailed } from "@/services/invoice.service";
import { invoicePdf } from "@/services/pdf.service";
import { getCompanySettings } from "@/services/settings.service";

/** Emails an issued invoice to the customer with the PDF attached. */
export const POST = apiRoute({ permission: "invoices:write" }, async ({ req, user, params }) => {
  const { to, message } = await parseBody(req, emailDocumentSchema);
  await enforceRateLimit(`invoice-email:${user.id}`, 30, 60 * 60, "Too many emails sent. Please try again later.");

  const invoice = await getInvoice(user, params.id);
  if (!invoice) throw new NotFoundError("Invoice");
  if (!invoice.invoiceNumber || invoice.storedStatus === "draft") throw new ConflictError("Issue the invoice before emailing it.");
  if (invoice.storedStatus === "cancelled") throw new ConflictError("Cancelled invoices cannot be emailed.");

  const [settings, pdf] = await Promise.all([getCompanySettings(), invoicePdf(user, params.id)]);
  const company = settings.companyName;
  const email = renderEmail({
    companyName: company,
    heading: `${invoice.title} ${invoice.invoiceNumber}`,
    intro:
      message ||
      `Dear ${invoice.billTo.name || "Customer"},\n\nPlease find attached ${invoice.title.toLowerCase()} ${invoice.invoiceNumber} from ${company}.`,
    rows: [
      { label: "Invoice number", value: invoice.invoiceNumber },
      { label: "Invoice date", value: formatDate(invoice.issueDate) },
      { label: "Due date", value: formatDate(invoice.dueDate) },
      { label: "Total", value: formatINR(invoice.totalPaise) },
      { label: "Balance due", value: formatINR(invoice.balancePaise) },
      ...(settings.upiId ? [{ label: "UPI", value: settings.upiId }] : []),
    ],
    footer: `Sent by ${company}${settings.phone ? ` · ${settings.phone}` : ""}${settings.email ? ` · ${settings.email}` : ""}`,
  });

  const result = await sendMail({
    to,
    subject: `${invoice.title} ${invoice.invoiceNumber} from ${company}`,
    html: email.html,
    text: email.text,
    attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }],
  });
  if (!result.sent) {
    throw new BadRequestError(
      result.reason === "not_configured"
        ? "Email is not configured. Add the SMTP settings to the environment first."
        : "The email could not be sent. Please try again later.",
    );
  }
  await markInvoiceEmailed(user, invoice.id, to);
  return { sent: true };
});
