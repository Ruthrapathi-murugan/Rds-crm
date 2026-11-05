import { apiRoute } from "@/lib/api/handler";
import {
  LEAD_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  PROJECT_STATUS_LABELS,
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/constants";
import { csvResponse, toCsv } from "@/lib/csv";
import { BadRequestError } from "@/lib/errors";
import { resolveReportRange } from "@/lib/report-range";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { paiseToRupeeString } from "@/lib/utils/money";
import {
  customerActivityReport,
  leadSourcesReport,
  monthlyRevenue,
  paymentsInRange,
  projectStatusReport,
  receivablesAging,
  revenueByServiceCategory,
} from "@/services/report.service";

const rupees = (paise: number) => paiseToRupeeString(paise);

/** CSV exports for every report. Amounts are rupees with two decimals. */
export const GET = apiRoute({ permission: "reports:read" }, async ({ req, user }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = resolveReportRange(sp);
  const suffix = `${toDateInputValue(range.from)}_to_${toDateInputValue(range.to)}`;

  switch (sp.report) {
    case "revenue": {
      const rows = await monthlyRevenue(range);
      return csvResponse(
        `revenue_${suffix}.csv`,
        toCsv(
          ["Month", "Payments received (INR)", "Payments", "Invoiced (INR)", "Invoices issued"],
          rows.map((r) => [r.label, rupees(r.receivedPaise), r.payments, rupees(r.invoicedPaise), r.invoices]),
        ),
      );
    }
    case "payments": {
      const rows = await paymentsInRange(range);
      return csvResponse(
        `payments_${suffix}.csv`,
        toCsv(
          ["Payment", "Date", "Customer", "Invoice", "Method", "Reference", "Amount (INR)"],
          rows.map((r) => [r.paymentNumber, formatDate(r.paidAt), r.customer, r.invoice, PAYMENT_METHOD_LABELS[r.method], r.reference, rupees(r.amountPaise)]),
        ),
      );
    }
    case "receivables": {
      const { rows } = await receivablesAging();
      return csvResponse(
        `receivables_${toDateInputValue(new Date())}.csv`,
        toCsv(
          ["Invoice", "Customer", "Invoice date", "Due date", "Days overdue", "Ageing", "Total (INR)", "Balance (INR)"],
          rows.map((r) => [r.invoiceNumber, r.customerName, formatDate(r.issueDate), formatDate(r.dueDate), r.daysOverdue, r.bucket, rupees(r.totalPaise), rupees(r.balancePaise)]),
        ),
      );
    }
    case "lead-sources": {
      const rows = await leadSourcesReport(user, range);
      return csvResponse(
        `lead_sources_${suffix}.csv`,
        toCsv(
          ["Source", "Leads", "Won", "Lost", "Conversion rate (%)", "Won value (INR)"],
          rows.map((r) => [LEAD_SOURCE_LABELS[r.source], r.total, r.won, r.lost, r.conversionRate.toFixed(1), rupees(r.wonValuePaise)]),
        ),
      );
    }
    case "services": {
      const rows = await revenueByServiceCategory(range);
      return csvResponse(
        `revenue_by_service_${suffix}.csv`,
        toCsv(
          ["Service category", "Invoice lines", "Taxable value (INR)"],
          rows.map((r) => [r.category === "uncategorised" ? "Other / custom lines" : SERVICE_CATEGORY_LABELS[r.category as ServiceCategory], r.lines, rupees(r.taxablePaise)]),
        ),
      );
    }
    case "projects": {
      const report = await projectStatusReport(user, range);
      return csvResponse(
        `projects_${suffix}.csv`,
        toCsv(
          ["Status", "Projects", "Quoted value (INR)"],
          report.statuses.map((r) => [PROJECT_STATUS_LABELS[r.status], r.count, rupees(r.quotedPaise)]),
        ),
      );
    }
    case "customers": {
      const { rows } = await customerActivityReport(range, 1000);
      return csvResponse(
        `customer_activity_${suffix}.csv`,
        toCsv(
          ["Customer no.", "Customer", "City", "Invoices", "Invoiced (INR)", "Received (INR)", "Outstanding now (INR)", "Last payment"],
          rows.map((r) => [r.customerNumber, r.name, r.city, r.invoices, rupees(r.invoicedPaise), rupees(r.receivedPaise), rupees(r.outstandingPaise), r.lastPaymentAt ? formatDate(r.lastPaymentAt) : ""]),
        ),
      );
    }
    default:
      throw new BadRequestError("Unknown report.");
  }
});
