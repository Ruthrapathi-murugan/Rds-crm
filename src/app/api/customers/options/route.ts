import { apiRoute } from "@/lib/api/handler";
import { customerOptions } from "@/services/customer.service";

export const GET = apiRoute({ permission: "customers:read" }, async ({ req }) =>
  customerOptions(req.nextUrl.searchParams.get("q") ?? ""),
);
