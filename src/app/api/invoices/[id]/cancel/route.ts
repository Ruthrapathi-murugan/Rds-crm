import { apiRoute, parseBody } from "@/lib/api/handler";
import { cancelInvoiceSchema } from "@/lib/validations/finance";
import { cancelInvoice } from "@/services/invoice.service";

export const POST = apiRoute({ permission: "invoices:cancel" }, async ({ req, user, params }) => {
  const { reason } = await parseBody(req, cancelInvoiceSchema);
  return cancelInvoice(user, params.id, reason);
});
