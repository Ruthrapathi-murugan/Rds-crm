import { apiRoute } from "@/lib/api/handler";
import { pdfResponse, quotationPdf } from "@/services/pdf.service";

export const GET = apiRoute({ permission: "quotations:read" }, async ({ req, user, params }) =>
  pdfResponse(await quotationPdf(user, params.id), req.nextUrl.searchParams.get("inline") === "1"),
);
