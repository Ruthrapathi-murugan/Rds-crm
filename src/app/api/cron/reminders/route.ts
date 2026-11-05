import { apiRoute } from "@/lib/api/handler";
import { getServerEnv } from "@/lib/env";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { isAuthorizedCronRequest, runReminders } from "@/services/reminder.service";

// Reminders can touch a few hundred records; allow more than the default budget.
export const maxDuration = 60;

/**
 * Scheduled reminder run (Vercel Cron every 15 minutes, or any external
 * scheduler). Requires `Authorization: Bearer <CRON_SECRET>`.
 */
export const GET = apiRoute({ auth: false }, async ({ req }) => {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) {
    throw new AppError("The reminder scheduler is disabled: set CRON_SECRET (16+ characters) to enable it.", 503, "cron_not_configured");
  }
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), secret)) {
    throw new UnauthorizedError("Invalid or missing cron secret.");
  }
  return runReminders();
});
