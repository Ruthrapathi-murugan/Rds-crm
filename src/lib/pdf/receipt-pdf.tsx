import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { amountInWords } from "@/lib/utils/amount-words";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatINR } from "@/lib/utils/money";
import type { PdfSeller } from "./document-pdf";
import { PDF_COLORS, pdfStyles as s } from "./styles";

export type ReceiptPdfProps = {
  seller: PdfSeller;
  paymentNumber: string;
  paidAt: string;
  amountPaise: number;
  methodLabel: string;
  transactionReference: string;
  receivedFrom: { name: string; businessName: string; address: string; gstin: string };
  invoiceNumber: string | null;
  invoiceBalancePaise: number | null;
  projectName: string | null;
  notes: string;
  voided: boolean;
  recordedAt: string;
};

export function ReceiptPdf(props: ReceiptPdfProps) {
  const rows: [string, string][] = [
    ["Receipt number", props.paymentNumber],
    ["Payment date", formatDate(props.paidAt)],
    ["Payment method", props.methodLabel],
    ...(props.transactionReference ? ([["Transaction reference", props.transactionReference]] as [string, string][]) : []),
    ...(props.invoiceNumber ? ([["Against invoice", props.invoiceNumber]] as [string, string][]) : []),
    ...(props.projectName ? ([["Project", props.projectName]] as [string, string][]) : []),
    ...(props.invoiceBalancePaise !== null ? ([["Invoice balance after this payment", formatINR(props.invoiceBalancePaise)]] as [string, string][]) : []),
  ];

  return (
    <Document title={`Payment receipt ${props.paymentNumber}`} author={props.seller.name} creator="RDS CRM">
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.brandBar} />
        {props.voided && <Text style={[s.stamp, { top: 140, left: 140, color: PDF_COLORS.danger }]}>VOID</Text>}
        <View style={[s.between, { marginBottom: 14 }]}>
          <View style={{ width: "60%" }}>
            <Text style={s.companyName}>{props.seller.name}</Text>
            {[props.seller.address, [props.seller.phone, props.seller.email].filter(Boolean).join(" · "), props.seller.gstin ? `GSTIN: ${props.seller.gstin}` : ""]
              .filter(Boolean)
              .map((line) => (
                <Text key={line} style={[s.muted, { marginTop: 2 }]}>
                  {line}
                </Text>
              ))}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.title}>PAYMENT RECEIPT</Text>
            <Text style={[s.semibold, { marginTop: 6 }]}>{props.paymentNumber}</Text>
          </View>
        </View>

        <View style={[s.row, { gap: 12 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>Received from</Text>
            <Text style={s.bold}>{props.receivedFrom.businessName || props.receivedFrom.name}</Text>
            {props.receivedFrom.businessName ? <Text>{props.receivedFrom.name}</Text> : null}
            {props.receivedFrom.address ? <Text style={s.muted}>{props.receivedFrom.address}</Text> : null}
            {props.receivedFrom.gstin ? <Text style={s.muted}>GSTIN: {props.receivedFrom.gstin}</Text> : null}
            <View style={{ marginTop: 10 }}>
              {rows.map(([label, value]) => (
                <View key={label} style={s.totalsRow}>
                  <Text style={s.muted}>{label}</Text>
                  <Text style={s.semibold}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[s.box, { width: "38%", backgroundColor: PDF_COLORS.brandSoft, borderColor: PDF_COLORS.brandSoft }]}>
            <Text style={s.label}>Amount received</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, color: PDF_COLORS.brand, lineHeight: 1.7 }}>{formatINR(props.amountPaise)}</Text>
            <Text style={[s.small, { marginTop: 8 }]}>{amountInWords(props.amountPaise)}</Text>
          </View>
        </View>
        {props.notes ? (
          <View style={{ marginTop: 10 }}>
            <Text style={s.label}>Notes</Text>
            <Text style={s.muted}>{props.notes}</Text>
          </View>
        ) : null}
        <View style={s.footer} fixed>
          <Text>Thank you for your payment.</Text>
          <Text>Computer-generated receipt · recorded {formatDateTime(props.recordedAt)}</Text>
        </View>
      </Page>
    </Document>
  );
}
