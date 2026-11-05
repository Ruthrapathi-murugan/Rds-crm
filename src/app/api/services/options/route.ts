import { apiRoute } from "@/lib/api/handler";
import { serviceOptions } from "@/services/service.service";

export const GET = apiRoute({}, async () => serviceOptions());
