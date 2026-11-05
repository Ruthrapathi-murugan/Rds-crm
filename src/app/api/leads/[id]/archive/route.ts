import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { setLeadArchived } from "@/services/lead.service";

const schema = z.object({ archived: z.boolean() });

export const POST = apiRoute({ permission: "leads:archive" }, async ({ req, user, params }) => {
  const { archived } = await parseBody(req, schema);
  return setLeadArchived(user, params.id, archived);
});
