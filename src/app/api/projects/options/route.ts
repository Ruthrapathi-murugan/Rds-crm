import { apiRoute } from "@/lib/api/handler";
import { projectOptions } from "@/services/project.service";

export const GET = apiRoute({ permission: "projects:read" }, async ({ req, user }) =>
  projectOptions(user, req.nextUrl.searchParams.get("q") ?? "", req.nextUrl.searchParams.get("customer")),
);
