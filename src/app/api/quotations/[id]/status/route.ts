import { apiRoute, parseBody } from "@/lib/api/handler";
import { quotationStatusSchema } from "@/lib/validations/finance";
import { setQuotationStatus } from "@/services/quotation.service";

export const PATCH = apiRoute({ permission: "quotations:write" }, async ({ req, user, params }) => {
  const { status } = await parseBody(req, quotationStatusSchema);
  return setQuotationStatus(user, params.id, status);
});
