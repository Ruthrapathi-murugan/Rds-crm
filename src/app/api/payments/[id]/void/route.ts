import { apiRoute, parseBody } from "@/lib/api/handler";
import { voidPaymentSchema } from "@/lib/validations/finance";
import { voidPayment } from "@/services/payment.service";

export const POST = apiRoute({ permission: "payments:void" }, async ({ req, user, params }) => {
  const { reason } = await parseBody(req, voidPaymentSchema);
  return voidPayment(user, params.id, reason);
});
