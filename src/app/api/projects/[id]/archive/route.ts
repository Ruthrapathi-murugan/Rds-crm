import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { setProjectArchived } from "@/services/project.service";

const schema = z.object({ archived: z.boolean() });

export const POST = apiRoute({ permission: "projects:archive" }, async ({ req, user, params }) => {
  const { archived } = await parseBody(req, schema);
  return setProjectArchived(user, params.id, archived);
});
