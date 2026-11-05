import { apiRoute, parseBody } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { quotationFormSchema } from "@/lib/validations/finance";
import { deleteDraftQuotation, getQuotation, updateQuotation } from "@/services/quotation.service";

export const GET = apiRoute({ permission: "quotations:read" }, async ({ user, params }) => {
  const quotation = await getQuotation(user, params.id);
  if (!quotation) throw new NotFoundError("Quotation");
  return quotation;
});

export const PUT = apiRoute({ permission: "quotations:write" }, async ({ req, user, params }) =>
  updateQuotation(user, params.id, await parseBody(req, quotationFormSchema)),
);

export const DELETE = apiRoute({ permission: "quotations:write" }, async ({ user, params }) =>
  deleteDraftQuotation(user, params.id),
);
