import { after } from "next/server";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { getRequestMeta } from "@/lib/request";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { completePasswordReset } from "@/services/password-reset.service";

/** Sets a new password using the reset token and signs the user out everywhere. */
export const POST = apiRoute({ auth: false }, async ({ req }) => {
  const { email, resetToken, newPassword } = await parseBody(req, resetPasswordSchema);
  const sendConfirmation = await completePasswordReset({ email, resetToken, newPassword }, await getRequestMeta());
  after(sendConfirmation);
  return { message: "Your password has been reset. Please sign in with your new password." };
});
