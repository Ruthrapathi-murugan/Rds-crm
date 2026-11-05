import { apiRoute, parseBody } from "@/lib/api/handler";
import { companySettingsSchema } from "@/lib/validations/settings";
import { getCompanySettings, updateCompanySettings } from "@/services/settings.service";

/** Any signed-in user: quotation and invoice forms need tax rates and default terms. */
export const GET = apiRoute({}, async () => getCompanySettings());

export const PUT = apiRoute({ permission: "settings:manage" }, async ({ req, user }) => {
  return updateCompanySettings(user, await parseBody(req, companySettingsSchema));
});
