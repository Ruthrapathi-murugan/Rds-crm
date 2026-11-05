import { apiRoute, parseBody } from "@/lib/api/handler";
import { SERVICE_CATEGORIES } from "@/lib/constants";
import { enumParam } from "@/lib/list-params";
import { serviceFormSchema } from "@/lib/validations/service";
import { createService, listServices } from "@/services/service.service";

export const GET = apiRoute({ permission: "services:read" }, async ({ req }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  return listServices({
    category: enumParam(sp, "category", SERVICE_CATEGORIES),
    status: enumParam(sp, "status", ["active", "inactive"] as const),
    q: sp.q ?? "",
  });
});

export const POST = apiRoute({ permission: "services:manage" }, async ({ req, user }) => {
  return createService(user, await parseBody(req, serviceFormSchema));
});
