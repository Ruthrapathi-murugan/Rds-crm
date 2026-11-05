import "server-only";
import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  isDuplicateKeyError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { ApiFailure, SessionUser } from "@/types";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

type HandlerArgs<TAuth extends boolean> = {
  req: NextRequest;
  params: Record<string, string>;
  user: TAuth extends true ? SessionUser : SessionUser | null;
};

type RouteOptions<TAuth extends boolean> = {
  /** Defaults to true. Public routes (login, health, cron) set this to false. */
  auth?: TAuth;
  /** Permission required on top of being signed in. */
  permission?: Permission;
  /** Allow while the user still has to replace a temporary password. */
  allowPendingPasswordChange?: boolean;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects cross-site state-changing requests (CSRF defence in depth on top
 * of SameSite=Lax cookies). Browsers always send Origin on POST/PATCH/DELETE.
 */
function assertSameOrigin(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ForbiddenError("Cross-site requests are not allowed.");
  }
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("Cross-site requests are not allowed.");
  }
  if (!host || originHost !== host) throw new ForbiddenError("Cross-site requests are not allowed.");
}

export function errorResponse(error: unknown): Response {
  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new ValidationError(fieldErrorsFromZod(error));
  } else if (error instanceof mongoose.Error.ValidationError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [path, err] of Object.entries(error.errors)) fieldErrors[path] = [err.message];
    appError = new ValidationError(fieldErrors);
  } else if (error instanceof mongoose.Error.VersionError) {
    appError = new ConflictError("This record was changed by someone else at the same time. Reload the page and try again.");
  } else if (error instanceof mongoose.Error.CastError) {
    appError = new BadRequestError("One of the values is not in the expected format.");
  } else if (isDuplicateKeyError(error)) {
    appError = new ConflictError("A record with these details already exists.");
  } else {
    // Unexpected: log server-side without request bodies, return a generic message.
    console.error("[api] unhandled error:", error instanceof Error ? `${error.name}: ${error.message}` : error);
    appError = new AppError("Something went wrong. Please try again.", 500, "internal_error");
  }

  const body: ApiFailure = {
    error: { message: appError.message, code: appError.code, fieldErrors: appError.fieldErrors },
  };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (appError instanceof RateLimitError) headers["Retry-After"] = String(appError.retryAfterSeconds);
  return Response.json(body, { status: appError.status, headers });
}

export function fieldErrorsFromZod(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Wraps a route handler with authentication, permission checks, CSRF
 * protection and uniform error handling. Return a plain value to send
 * `{ data: value }`, or a Response for full control (files, redirects).
 */
export function apiRoute<TAuth extends boolean = true>(
  options: RouteOptions<TAuth>,
  handler: (args: HandlerArgs<TAuth>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<Response> => {
    try {
      // API responses are always per-request; never prerender them.
      await connection();
      assertSameOrigin(req);

      const requireAuth = options.auth ?? true;
      const user = await getCurrentUser();
      if (requireAuth) {
        if (!user) throw new UnauthorizedError();
        if (user.mustChangePassword && !options.allowPendingPasswordChange) {
          throw new ForbiddenError("Please change your temporary password first.");
        }
        if (options.permission && !hasPermission(user, options.permission)) throw new ForbiddenError();
      }

      const rawParams = ctx?.params ? await ctx.params : {};
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawParams)) {
        if (typeof value === "string") params[key] = value;
      }

      const result = await handler({ req, params, user: user as HandlerArgs<TAuth>["user"] });
      if (result instanceof Response) return result;
      return Response.json({ data: result ?? null }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      unstable_rethrow(error); // let Next.js handle its own control-flow errors
      return errorResponse(error);
    }
  };
}

/** Parses and validates a JSON body. Unknown keys are stripped by the schema. */
export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.output<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new BadRequestError("The request body must be valid JSON.");
  }
  return schema.parse(json);
}

/** Parses query-string parameters with a schema. */
export function parseQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.output<T> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
