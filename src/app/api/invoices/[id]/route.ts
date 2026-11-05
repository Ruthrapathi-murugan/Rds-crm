import { apiRoute, parseBody } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { invoiceFormSchema } from "@/lib/validations/finance";
import { deleteDraftInvoice, getInvoice, updateInvoice } from "@/services/invoice.service";

export const GET = apiRoute({ permission: "invoices:read" }, async ({ user, params }) => {
  const invoice = await getInvoice(user, params.id);
  if (!invoice) throw new NotFoundError("Invoice");
  return invoice;
});

/** Only drafts can be edited; issued invoices are immutable. */
export const PUT = apiRoute({ permission: "invoices:write" }, async ({ req, user, params }) =>
  updateInvoice(user, params.id, await parseBody(req, invoiceFormSchema)),
);

/** Only drafts (which have no number) can be deleted. */
export const DELETE = apiRoute({ permission: "invoices:write" }, async ({ user, params }) =>
  deleteDraftInvoice(user, params.id),
);
