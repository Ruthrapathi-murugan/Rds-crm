import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { TaxMode } from "@/lib/constants";
import { amountInWords } from "@/lib/utils/amount-words";
import { formatDate } from "@/lib/utils/date";
import { formatBasisPoints, formatINR, paiseToRupeeString } from "@/lib/utils/money";
import type { BillTo, DocumentLine, DocumentTotals } from "@/services/finance/documents";
import { PDF_COLORS, pdfStyles as s } from "./styles";

export type PdfSeller = {
  name: string;
  address: string;
  stateName: string;
  stateCode: string;
  gstin: string;
  email: string;
  phone: string;
  website?: string;
  pan?: string;
};

export type PdfBank = {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  upiId: string;
};

export type FinanceDocumentPdfProps = {
  kind: "invoice" | "quotation";
  title: string;
  number: string;
  issueDate: string;
  /** Due date (invoice) or valid-until date (quotation). */
  secondaryDate: string;
  seller: PdfSeller;
  billTo: BillTo;
  placeOfSupply?: string;
  taxMode: TaxMode;
  items: DocumentLine[];
  totals: DocumentTotals;
  amountPaidPaise?: number;
  balancePaise?: number;
  terms: string;
  notes: string;
  bank: PdfBank | null;
  stamp?: "DRAFT" | "CANCELLED" | "PAID" | null;
};

const amount = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (paise: number) => amount.format(Number(paiseToRupeeString(paise)));

type Column = { key: string; label: string; width: string; align?: "right"; render: (line: DocumentLine, i: number) => string };

function columnsFor(taxMode: TaxMode): Column[] {
  const base: Column[] = [
    { key: "no", label: "#", width: "4%", render: (_l, i) => String(i + 1) },
    { key: "desc", label: "Description", width: "auto", render: (l) => l.description },
    { key: "qty", label: "Qty", width: "6%", align: "right", render: (l) => String(l.quantity) },
    { key: "rate", label: "Rate", width: "11%", align: "right", render: (l) => n(l.unitPricePaise) },
    { key: "disc", label: "Discount", width: "10%", align: "right", render: (l) => (l.discountPaise ? n(l.discountPaise) : "—") },
  ];
  if (taxMode === "none") {
    return [...base, { key: "amt", label: "Amount", width: "14%", align: "right", render: (l) => n(l.totalPaise) }];
  }
  const taxable: Column = { key: "taxable", label: "Taxable", width: "12%", align: "right", render: (l) => n(l.taxablePaise) };
  const total: Column = { key: "amt", label: "Amount", width: "13%", align: "right", render: (l) => n(l.totalPaise) };
  if (taxMode === "intra_state") {
    return [
      ...base,
      taxable,
      {
        key: "cgst",
        label: "CGST",
        width: "11%",
        align: "right",
        render: (l) => `${n(l.cgstPaise)}\n@${formatBasisPoints(l.taxRateBps / 2)}`,
      },
      {
        key: "sgst",
        label: "SGST",
        width: "11%",
        align: "right",
        render: (l) => `${n(l.sgstPaise)}\n@${formatBasisPoints(l.taxRateBps / 2)}`,
      },
      total,
    ];
  }
  return [
    ...base,
    taxable,
    { key: "igst", label: "IGST", width: "12%", align: "right", render: (l) => `${n(l.igstPaise)}\n@${formatBasisPoints(l.taxRateBps)}` },
    total,
  ];
}

function colStyle(column: Column): { flex?: number; paddingRight?: number; width?: string; textAlign?: "left" | "right"; paddingLeft?: number } {
  return column.width === "auto"
    ? { flex: 1, paddingRight: 6 }
    : { width: column.width, textAlign: column.align ?? "left", paddingLeft: 4 };
}

export function FinanceDocumentPdf(props: FinanceDocumentPdfProps) {
  const columns = columnsFor(props.taxMode);
  const { totals } = props;
  const isInvoice = props.kind === "invoice";
  const sellerLines = [
    props.seller.address,
    [props.seller.phone, props.seller.email].filter(Boolean).join(" · "),
    props.seller.website,
    props.seller.gstin ? `GSTIN: ${props.seller.gstin}` : "",
    props.seller.pan ? `PAN: ${props.seller.pan}` : "",
  ].filter(Boolean);

  return (
    <Document title={`${props.title} ${props.number}`} author={props.seller.name} creator="RDS CRM" producer="RDS CRM">
      <Page size="A4" style={s.page} wrap>
        <View style={s.brandBar} fixed />
        {props.stamp && (
          <Text
            style={[s.stamp, { color: props.stamp === "PAID" ? PDF_COLORS.success : props.stamp === "CANCELLED" ? PDF_COLORS.danger : PDF_COLORS.muted }]}
            fixed
          >
            {props.stamp}
          </Text>
        )}

        {/* Header */}
        <View style={[s.between, { marginBottom: 18 }]}>
          <View style={{ width: "58%" }}>
            <Text style={s.companyName}>{props.seller.name}</Text>
            {sellerLines.map((line) => (
              <Text key={line} style={[s.muted, { marginTop: 2 }]}>
                {line}
              </Text>
            ))}
          </View>
          <View style={{ width: "40%", alignItems: "flex-end" }}>
            <Text style={s.title}>{props.title.toUpperCase()}</Text>
            <View style={{ marginTop: 8, alignItems: "flex-end" }}>
              <Text style={s.semibold}>{props.number}</Text>
              <Text style={[s.muted, { marginTop: 2 }]}>
                {isInvoice ? "Invoice date" : "Date"}: {formatDate(props.issueDate)}
              </Text>
              <Text style={s.muted}>
                {isInvoice ? "Due date" : "Valid until"}: {formatDate(props.secondaryDate)}
              </Text>
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={[s.row, { gap: 10, marginBottom: 16 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>{isInvoice ? "Bill to" : "Prepared for"}</Text>
            <Text style={s.bold}>{props.billTo.businessName || props.billTo.name}</Text>
            {props.billTo.businessName && <Text>{props.billTo.name}</Text>}
            {[props.billTo.address, [props.billTo.city, props.billTo.state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .map((line) => (
                <Text key={line} style={s.muted}>
                  {line}
                </Text>
              ))}
            {[props.billTo.phone, props.billTo.email].filter(Boolean).length > 0 && (
              <Text style={s.muted}>{[props.billTo.phone, props.billTo.email].filter(Boolean).join(" · ")}</Text>
            )}
            {props.billTo.gstin && <Text style={[s.semibold, { marginTop: 2 }]}>GSTIN: {props.billTo.gstin}</Text>}
          </View>
          <View style={[s.box, { width: "36%" }]}>
            <Text style={s.label}>Tax treatment</Text>
            <Text style={s.semibold}>
              {props.taxMode === "none"
                ? "GST not charged"
                : props.taxMode === "intra_state"
                  ? "Intra-state supply (CGST + SGST)"
                  : "Inter-state supply (IGST)"}
            </Text>
            {props.placeOfSupply ? (
              <Text style={[s.muted, { marginTop: 4 }]}>
                Place of supply: {props.placeOfSupply}
                {props.billTo.stateCode ? ` (${props.billTo.stateCode})` : ""}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Line items */}
        <View style={s.tableHeader} fixed>
          {columns.map((column) => (
            <Text key={column.key} style={colStyle(column)}>
              {column.label}
            </Text>
          ))}
        </View>
        {props.items.map((line, index) => (
          <View key={index} style={[s.tableRow, index % 2 === 1 ? { backgroundColor: PDF_COLORS.stripe } : {}]} wrap={false}>
            {columns.map((column) => (
              <View key={column.key} style={colStyle(column)}>
                <Text>{column.render(line, index)}</Text>
                {column.key === "desc" && line.sacCode ? <Text style={[s.small, s.muted]}>SAC/HSN {line.sacCode}</Text> : null}
              </View>
            ))}
          </View>
        ))}

        {/* Totals */}
        <View style={[s.between, { marginTop: 14 }]} wrap={false}>
          <View style={{ width: "52%", paddingRight: 12 }}>
            <Text style={s.label}>Amount in words</Text>
            <Text style={s.semibold}>{amountInWords(totals.totalPaise)}</Text>
          </View>
          <View style={{ width: "44%" }}>
            <View style={s.totalsRow}>
              <Text style={s.muted}>Subtotal</Text>
              <Text>{formatINR(totals.subtotalPaise)}</Text>
            </View>
            {totals.discountPaise > 0 && (
              <View style={s.totalsRow}>
                <Text style={s.muted}>Discount</Text>
                <Text>− {formatINR(totals.discountPaise)}</Text>
              </View>
            )}
            {props.taxMode !== "none" && (
              <View style={s.totalsRow}>
                <Text style={s.muted}>Taxable value</Text>
                <Text>{formatINR(totals.taxablePaise)}</Text>
              </View>
            )}
            {props.taxMode === "intra_state" && (
              <>
                <View style={s.totalsRow}>
                  <Text style={s.muted}>CGST</Text>
                  <Text>{formatINR(totals.cgstPaise)}</Text>
                </View>
                <View style={s.totalsRow}>
                  <Text style={s.muted}>SGST</Text>
                  <Text>{formatINR(totals.sgstPaise)}</Text>
                </View>
              </>
            )}
            {props.taxMode === "inter_state" && (
              <View style={s.totalsRow}>
                <Text style={s.muted}>IGST</Text>
                <Text>{formatINR(totals.igstPaise)}</Text>
              </View>
            )}
            <View style={s.grandTotal}>
              <Text>Total</Text>
              <Text>{formatINR(totals.totalPaise)}</Text>
            </View>
            {isInvoice && props.amountPaidPaise !== undefined && props.amountPaidPaise > 0 && (
              <>
                <View style={[s.totalsRow, { marginTop: 4 }]}>
                  <Text style={s.muted}>Amount received</Text>
                  <Text>{formatINR(props.amountPaidPaise)}</Text>
                </View>
                <View style={s.totalsRow}>
                  <Text style={s.bold}>Balance due</Text>
                  <Text style={s.bold}>{formatINR(props.balancePaise ?? 0)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Payment details, notes and terms */}
        <View style={[s.row, { gap: 10, marginTop: 18 }]} wrap={false}>
          {props.bank && (props.bank.bankAccountNumber || props.bank.upiId) ? (
            <View style={[s.box, { flex: 1 }]}>
              <Text style={s.label}>Payment details</Text>
              {props.bank.bankAccountName ? <Text>Account name: {props.bank.bankAccountName}</Text> : null}
              {props.bank.bankName ? <Text>Bank: {props.bank.bankName}</Text> : null}
              {props.bank.bankAccountNumber ? <Text>Account no.: {props.bank.bankAccountNumber}</Text> : null}
              {props.bank.bankIfsc ? <Text>IFSC: {props.bank.bankIfsc}</Text> : null}
              {props.bank.upiId ? <Text>UPI: {props.bank.upiId}</Text> : null}
            </View>
          ) : null}
          {props.notes ? (
            <View style={[s.box, { flex: 1 }]}>
              <Text style={s.label}>Notes</Text>
              <Text>{props.notes}</Text>
            </View>
          ) : null}
        </View>
        {props.terms ? (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={s.label}>Terms & conditions</Text>
            <Text style={s.muted}>{props.terms}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>
            {props.title} {props.number} · {props.seller.name}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `This is a computer-generated document · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
