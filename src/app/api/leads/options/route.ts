import { apiRoute } from "@/lib/api/handler";
import { leadOptions } from "@/services/lead.service";

export const GET = apiRoute({ permission: "leads:read" }, async ({ req, user }) =>
  leadOptions(user, req.nextUrl.searchParams.get("q") ?? ""),
);
