import { apiRoute, parseBody } from "@/lib/api/handler";
import { createUserSchema } from "@/lib/validations/auth";
import { createUser, listUsers } from "@/services/user.service";

export const GET = apiRoute({ permission: "users:manage" }, async () => listUsers());

export const POST = apiRoute({ permission: "users:manage" }, async ({ req, user }) => {
  const input = await parseBody(req, createUserSchema);
  return createUser(user, input);
});
