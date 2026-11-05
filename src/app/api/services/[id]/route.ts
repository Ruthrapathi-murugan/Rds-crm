import { apiRoute, parseBody } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";
import { serviceActiveSchema, serviceFormSchema } from "@/lib/validations/service";
import { getService, setServiceActive, updateService } from "@/services/service.service";

export const GET = apiRoute({ permission: "services:read" }, async ({ params }) => {
  const service = await getService(params.id);
  if (!service) throw new NotFoundError("Service");
  return service;
});

export const PUT = apiRoute({ permission: "services:manage" }, async ({ req, user, params }) => {
  return updateService(user, params.id, await parseBody(req, serviceFormSchema));
});

export const PATCH = apiRoute({ permission: "services:manage" }, async ({ req, user, params }) => {
  const { isActive } = await parseBody(req, serviceActiveSchema);
  return setServiceActive(user, params.id, isActive);
});
