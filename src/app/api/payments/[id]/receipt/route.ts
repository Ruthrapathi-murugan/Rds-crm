import { apiRoute } from "@/lib/api/handler";
import { pdfResponse, receiptPdf } from "@/services/pdf.service";

export const GET = apiRoute({ permission: "payments:read" }, async ({ req, user, params }) =>
  pdfResponse(await receiptPdf(user, params.id), req.nextUrl.searchParams.get("inline") === "1"),
);
