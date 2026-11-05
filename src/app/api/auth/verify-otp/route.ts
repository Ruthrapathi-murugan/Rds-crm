import { apiRoute, parseBody } from "@/lib/api/handler";
import { getRequestMeta } from "@/lib/request";
import { verifyOtpSchema } from "@/lib/validations/auth";
import { verifyPasswordResetOtp } from "@/services/password-reset.service";

/** Exchanges a correct email OTP for a short-lived, single-use reset token. */
export const POST = apiRoute({ auth: false }, async ({ req }) => {
  const input = await parseBody(req, verifyOtpSchema);
  return verifyPasswordResetOtp(input, await getRequestMeta());
});
