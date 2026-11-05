/**
 * Application errors with an HTTP status and a message that is safe to show
 * to the user. Anything that is not an AppError is reported to the client as
 * a generic 500 so internal details never leak.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "The request is not valid.", fieldErrors?: Record<string, string[]>) {
    super(message, 400, "bad_request", fieldErrors);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: Record<string, string[]>, message = "Please correct the highlighted fields.") {
    super(message, 422, "validation_error", fieldErrors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`, 404, "not_found");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = "Too many attempts. Please wait a few minutes and try again.",
    readonly retryAfterSeconds = 60,
  ) {
    super(message, 429, "rate_limited");
  }
}

export function isDuplicateKeyError(error: unknown): error is { code: 11000; keyPattern?: Record<string, unknown> } {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}
