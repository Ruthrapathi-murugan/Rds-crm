import "server-only";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { TaxMode } from "@/lib/constants";
import { amountInWords } from "@/lib/utils/amount-words";
import { formatDate } from "@/lib/utils/date";
import { formatBasisPoints, formatINR } from "@/lib/utils/money";
import type { BillTo, DocumentLine, DocumentTotals } from "@/services/finance/documents";
import { ClosingBlock, ContactFooter } from "./contact-footer";
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
  /** Short "City, State PIN" line for the footer contact strip. */
  location?: string;
  /** Logo as a PNG/JPEG data URL, or null when none is configured. */
  logo?: string | null;
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

type Column = { key: string; label: string; width: string; align?: "right" | "center"; render: (line: DocumentLine) => string };

/** HSN/SAC · Description · Qty · Price · (Discount) · Total — Total is the pre-tax line value. */
function columnsFor(items: DocumentLine[]): Column[] {
  const hasDiscount = items.some((l) => l.discountPaise > 0);
  return [
    { key: "sac", label: "HSN/SAC", width: "13%", render: (l) => l.sacCode || "—" },
    { key: "desc", label: "Description", width: "auto", render: (l) => l.description },
    { key: "qty", label: "Qty", width: "8%", align: "center", render: (l) => String(l.quantity) },
    { key: "price", label: "Price", width: "15%", align: "right", render: (l) => formatINR(l.unitPricePaise) },
    ...(hasDiscount
      ? [{ key: "disc", label: "Discount", width: "13%", align: "right", render: (l) => (l.discountPaise ? formatINR(l.discountPaise) : "—") } as Column]
      : []),
    { key: "total", label: "Total", width: "16%", align: "right", render: (l) => formatINR(l.taxablePaise) },
  ];
}

function colStyle(column: Column) {
  return column.width === "auto"
    ? { flex: 1, paddingRight: 8 }
    : { width: column.width, textAlign: column.align ?? ("left" as const), paddingLeft: 4 };
}

/**
 * Tax rows for the totals block, one per GST rate ("CGST (9%)", "SGST (9%)" or
 * "IGST (18%)"). If the per-rate sums ever disagree with the stored totals,
 * fall back to unlabelled rows so the printed figures always add up.
 */
function taxRows(taxMode: TaxMode, items: DocumentLine[], totals: DocumentTotals): [string, number][] {
  if (taxMode === "none") return [];
  const byRate = new Map<number, { cgst: number; sgst: number; igst: number }>();
  for (const line of items) {
    if (line.taxRateBps <= 0) continue;
    const entry = byRate.get(line.taxRateBps) ?? { cgst: 0, sgst: 0, igst: 0 };
    entry.cgst += line.cgstPaise;
    entry.sgst += line.sgstPaise;
    entry.igst += line.igstPaise;
    byRate.set(line.taxRateBps, entry);
  }
  const rates = [...byRate.entries()].sort(([a], [b]) => a - b);
  if (taxMode === "intra_state") {
    const cgst = rates.reduce((acc, [, v]) => acc + v.cgst, 0);
    const sgst = rates.reduce((acc, [, v]) => acc + v.sgst, 0);
    if (cgst !== totals.cgstPaise || sgst !== totals.sgstPaise) {
      return [
        ["CGST", totals.cgstPaise],
        ["SGST", totals.sgstPaise],
      ];
    }
    return rates.flatMap(([bps, v]): [string, number][] => [
      [`CGST (${formatBasisPoints(bps / 2)})`, v.cgst],
      [`SGST (${formatBasisPoints(bps / 2)})`, v.sgst],
    ]);
  }
  const igst = rates.reduce((acc, [, v]) => acc + v.igst, 0);
  if (igst !== totals.igstPaise) return [["IGST", totals.igstPaise]];
  return rates.map(([bps, v]): [string, number] => [`IGST (${formatBasisPoints(bps)})`, v.igst]);
}

export function FinanceDocumentPdf(props: FinanceDocumentPdfProps) {
  const { totals, seller, billTo } = props;
  const columns = columnsFor(props.items);
  const isInvoice = props.kind === "invoice";
  const sellerLines = [
    seller.address,
    seller.phone ? `Ph: ${seller.phone}` : "",
    seller.email,
    seller.gstin ? `GSTIN: ${seller.gstin}` : "",
    seller.pan ? `PAN: ${seller.pan}` : "",
  ].filter(Boolean);
  const billToAddress = [billTo.address, [billTo.city, billTo.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const showBalance = isInvoice && props.amountPaidPaise !== undefined && props.amountPaidPaise > 0;

  return (
    <Document title={`${props.title} ${props.number}`} author={seller.name} creator="RDS CRM" producer="RDS CRM">
      <Page size="A4" style={[s.page, { paddingBottom: 96 }]} wrap>
        {props.stamp && (
          <Text
            style={[s.stamp, { color: props.stamp === "PAID" ? PDF_COLORS.success : props.stamp === "CANCELLED" ? PDF_COLORS.danger : PDF_COLORS.muted }]}
            fixed
          >
            {props.stamp}
          </Text>
        )}

        {/* Header: logo, title and number on the left; seller details on the right */}
        <View style={[s.between, { alignItems: "flex-start" }]}>
          <View style={{ width: "45%" }}>
            {seller.logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image src={seller.logo} style={s.logo} />
            ) : null}
            <Text style={[s.docTitle, { marginTop: seller.logo ? 12 : 0 }]}>{props.title.toUpperCase()}</Text>
            <Text style={s.docNumber}>
              <Text style={s.bold}>{isInvoice ? "Invoice No:" : "Quotation No:"}</Text> {props.number}
            </Text>
          </View>
          <View style={{ width: "53%", alignItems: "flex-end" }}>
            <Text style={s.sellerName}>{seller.name}</Text>
            {sellerLines.map((line) => (
              <Text key={line} style={s.sellerLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={s.rule} />

        {/* Bill to on the left; dates on the right */}
        <View style={[s.between, { alignItems: "flex-start", marginBottom: 22 }]}>
          <View style={{ width: "60%" }}>
            <Text style={s.billLabel}>{isInvoice ? "BILL TO:" : "PREPARED FOR:"}</Text>
            <Text style={s.billName}>{billTo.businessName || billTo.name}</Text>
            {billTo.businessName && billTo.name ? <Text>Attn: {billTo.name}</Text> : null}
            {billTo.phone ? <Text>Ph: {billTo.phone}</Text> : null}
            {billTo.gstin ? <Text>GSTIN: {billTo.gstin}</Text> : null}
            {billTo.email ? <Text>{billTo.email}</Text> : null}
            {billToAddress ? <Text>{billToAddress}</Text> : null}
            {props.placeOfSupply ? (
              <Text style={[s.muted, { marginTop: 4 }]}>
                Place of supply: {props.placeOfSupply}
                {billTo.stateCode ? ` (${billTo.stateCode})` : ""}
              </Text>
            ) : null}
          </View>
          <View style={{ width: "36%" }}>
            <View style={s.dateRow}>
              <Text style={s.dateLabel}>{isInvoice ? "Invoice Date:" : "Date:"}</Text>
              <Text>{formatDate(props.issueDate)}</Text>
            </View>
            <View style={s.dateRow}>
              <Text style={s.dateLabel}>{isInvoice ? "Due Date:" : "Valid Until:"}</Text>
              <Text>{formatDate(props.secondaryDate)}</Text>
            </View>
          </View>
        </View>

        {/* Line items */}
        <View style={s.itemsHeader} fixed>
          {columns.map((column) => (
            <Text key={column.key} style={colStyle(column)}>
              {column.label.toUpperCase()}
            </Text>
          ))}
        </View>
        {props.items.map((line, index) => (
          <View key={index} style={s.itemsRow} wrap={false}>
            {columns.map((column) => (
              <Text key={column.key} style={colStyle(column)}>
                {column.render(line)}
              </Text>
            ))}
          </View>
        ))}

        {/* Amount in words on the left; totals on the right */}
        <View style={[s.between, { marginTop: 18, alignItems: "flex-start" }]} wrap={false}>
          <View style={{ width: "48%", paddingRight: 12 }}>
            <Text style={s.label}>Amount in words</Text>
            <Text style={s.semibold}>{amountInWords(totals.totalPaise)}</Text>
          </View>
          <View style={{ width: "44%" }}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal:</Text>
              <Text>{formatINR(totals.subtotalPaise)}</Text>
            </View>
            {totals.discountPaise > 0 && (
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Discount:</Text>
                <Text>− {formatINR(totals.discountPaise)}</Text>
              </View>
            )}
            {taxRows(props.taxMode, props.items, totals).map(([label, paise]) => (
              <View key={label} style={s.totalsRow}>
                <Text style={s.totalsLabel}>{label}:</Text>
                <Text>{formatINR(paise)}</Text>
              </View>
            ))}
            <View style={s.totalDue}>
              <Text>{isInvoice ? "Total Due:" : "Total:"}</Text>
              <Text>{formatINR(totals.totalPaise)}</Text>
            </View>
            {showBalance && (
              <>
                <View style={[s.totalsRow, { marginTop: 4 }]}>
                  <Text style={s.totalsLabel}>Amount received:</Text>
                  <Text>{formatINR(props.amountPaidPaise ?? 0)}</Text>
                </View>
                <View style={s.totalsRow}>
                  <Text style={s.bold}>Balance due:</Text>
                  <Text style={s.bold}>{formatINR(props.balancePaise ?? 0)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Payment details, notes and terms */}
        <View style={[s.row, { gap: 10, marginTop: 20 }]} wrap={false}>
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

        <ClosingBlock message="Thank you for your business!" />

        <ContactFooter
          location={seller.location}
          email={seller.email}
          website={seller.website}
          meta={
            <>
              <Text>
                {props.title} {props.number}
              </Text>
              {/* No "Page X of Y": react-pdf drops render-prop text on pages with a lineHeight. */}
              <Text>Computer-generated document</Text>
            </>
          }
        />
      </Page>
    </Document>
  );
}
