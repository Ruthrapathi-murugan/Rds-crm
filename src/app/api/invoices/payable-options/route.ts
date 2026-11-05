import { apiRoute } from "@/lib/api/handler";
import { payableInvoiceOptions } from "@/services/payment.service";

export const GET = apiRoute({ permission: "payments:write" }, async ({ req }) =>
  payableInvoiceOptions(req.nextUrl.searchParams.get("q") ?? "", req.nextUrl.searchParams.get("customer") ?? undefined),
);
