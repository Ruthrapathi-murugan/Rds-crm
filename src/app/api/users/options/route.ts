import { apiRoute } from "@/lib/api/handler";
import { userOptions } from "@/services/user.service";

/** Active team members for "assigned to" pickers (names and roles only). */
export const GET = apiRoute({}, async () => userOptions());
