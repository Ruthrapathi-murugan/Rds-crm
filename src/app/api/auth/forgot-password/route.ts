import { after } from "next/server";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { getRequestMeta } from "@/lib/request";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { requestPasswordReset } from "@/services/password-reset.service";

/**
 * Starts a password reset. The response is identical whether or not the
 * email belongs to an account; the email itself is sent after responding.
 */
export const POST = apiRoute({ auth: false }, async ({ req }) => {
  const { email } = await parseBody(req, forgotPasswordSchema);
  const sendCode = await requestPasswordReset(email, await getRequestMeta());
  after(sendCode);
  return {
    message: "If an account exists for this email, a 6-digit code has been sent. It expires in 5 minutes.",
  };
});
