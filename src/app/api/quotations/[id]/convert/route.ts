import { apiRoute } from "@/lib/api/handler";
import { assertPermission } from "@/lib/auth/current-user";
import { convertQuotationToInvoice } from "@/services/quotation.service";

export const POST = apiRoute({ permission: "quotations:write" }, async ({ user, params }) => {
  assertPermission(user, "invoices:write");
  return convertQuotationToInvoice(user, params.id);
});
