import { apiRoute } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { getPayment } from "@/services/payment.service";

export const GET = apiRoute({ permission: "payments:read" }, async ({ user, params }) => {
  const payment = await getPayment(user, params.id);
  if (!payment) throw new NotFoundError("Payment");
  return payment;
});
