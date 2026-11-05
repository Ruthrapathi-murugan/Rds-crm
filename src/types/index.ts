import type { Role } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";

/** The signed-in user as seen by server code and (narrowed) by the UI. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
};

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type SortDirection = "asc" | "desc";

export type ListParams<TSort extends string = string> = {
  page: number;
  pageSize: number;
  q: string;
  sort: TSort;
  dir: SortDirection;
};

/** Lightweight option for comboboxes and selects. */
export type Option = { value: string; label: string; description?: string };

/** JSON body shape returned by every API route. */
export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
};
