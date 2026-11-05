import { apiRoute } from "@/lib/api/handler";
import { globalSearch } from "@/services/search.service";

export const GET = apiRoute({}, async ({ req, user }) => globalSearch(user, req.nextUrl.searchParams.get("q") ?? ""));
