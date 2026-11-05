import { apiRoute } from "@/lib/api/handler";
import { BadRequestError, ForbiddenError } from "@/lib/errors";
import { suggestTaxMode } from "@/lib/finance/document-calc";
import { hasPermission } from "@/lib/permissions";
import { isObjectIdString } from "@/services/scope";
import { buildBillTo } from "@/services/finance/documents";
import { getCompanySettings } from "@/services/settings.service";

/**
 * Billing details for a customer as they would be copied onto a quotation or
 * invoice, plus the suggested GST treatment for that customer's state.
 */
export const GET = apiRoute({}, async ({ req, user }) => {
  if (!hasPermission(user, "quotations:write") && !hasPermission(user, "invoices:write")) throw new ForbiddenError();
  const customer = req.nextUrl.searchParams.get("customer");
  if (!isObjectIdString(customer)) throw new BadRequestError("Choose a customer.");
  const [{ customerId, ...billTo }, settings] = await Promise.all([buildBillTo(customer), getCompanySettings()]);
  return {
    customerId: customerId.toString(),
    billTo,
    suggestedTaxMode: suggestTaxMode({
      sellerGstRegistered: settings.gstRegistered && Boolean(settings.gstin),
      sellerStateCode: settings.stateCode,
      customerStateCode: billTo.stateCode,
    }),
  };
});
