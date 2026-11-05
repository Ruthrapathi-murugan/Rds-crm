import { apiRoute } from "@/lib/api/handler";
import { invoicePdf, pdfResponse } from "@/services/pdf.service";

export const GET = apiRoute({ permission: "invoices:read" }, async ({ req, user, params }) =>
  pdfResponse(await invoicePdf(user, params.id), req.nextUrl.searchParams.get("inline") === "1"),
);
