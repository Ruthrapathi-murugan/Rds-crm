"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type RequestOptions = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal };

/**
 * Calls an internal API route and returns its `data`. Errors become
 * ApiClientError with the server's safe message and field errors.
 */
export async function api<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = options.body === undefined ? "GET" : "POST", body, signal } = options;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiClientError("Could not reach the server. Check your connection and try again.", 0, "network_error");
  }

  if (response.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }

  const json = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string; code?: string; fieldErrors?: Record<string, string[]> } }
    | null;

  if (!response.ok) {
    throw new ApiClientError(
      json?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      json?.error?.code ?? "error",
      json?.error?.fieldErrors,
    );
  }
  return json?.data as T;
}

/**
 * Shows server validation errors on the matching form fields and a toast
 * with the overall message. Returns the message for inline display.
 */
export function handleFormError<T extends FieldValues>(form: UseFormReturn<T>, error: unknown, fallback?: string) {
  if (error instanceof ApiClientError) {
    let applied = false;
    for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
      if (field === "_form") continue;
      form.setError(field as Path<T>, { type: "server", message: messages[0] });
      applied = true;
    }
    toast.error(applied ? "Please check the highlighted fields." : error.message);
    return error.message;
  }
  const message = fallback ?? "Something went wrong. Please try again.";
  toast.error(message);
  return message;
}

export function toastError(error: unknown) {
  toast.error(error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.");
}
