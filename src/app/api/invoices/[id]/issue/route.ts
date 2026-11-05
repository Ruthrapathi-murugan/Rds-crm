import { apiRoute } from "@/lib/api/handler";
import { issueInvoice } from "@/services/invoice.service";

export const POST = apiRoute({ permission: "invoices:write" }, async ({ user, params }) => issueInvoice(user, params.id));
