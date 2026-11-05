import type { ListParams, Paginated, SortDirection } from "@/types";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function firstParam(sp: SearchParamsRecord, key: string): string | undefined {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normalises list query parameters (page, pageSize, q, sort, dir). Sort keys
 * are whitelisted so users cannot sort or probe on arbitrary fields.
 */
export function parseListParams<TSort extends string>(
  sp: SearchParamsRecord,
  options: { sortable: readonly TSort[]; defaultSort: TSort; defaultDir?: SortDirection; defaultPageSize?: number },
): ListParams<TSort> {
  const toInt = (v: string | undefined, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  const sortParam = firstParam(sp, "sort");
  const dirParam = firstParam(sp, "dir");
  return {
    page: toInt(firstParam(sp, "page"), 1, 1, 10_000),
    pageSize: toInt(firstParam(sp, "pageSize"), options.defaultPageSize ?? 20, 5, 100),
    q: (firstParam(sp, "q") ?? "").trim().slice(0, 100),
    sort: (options.sortable as readonly string[]).includes(sortParam ?? "")
      ? (sortParam as TSort)
      : options.defaultSort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : (options.defaultDir ?? "desc"),
  };
}

/** Returns the value only if it is one of the allowed options. */
export function enumParam<T extends string>(sp: SearchParamsRecord, key: string, allowed: readonly T[]): T | undefined {
  const value = firstParam(sp, key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive "contains" match across several fields. */
export function searchFilter(q: string, fields: readonly string[]) {
  if (!q) return {};
  const pattern = new RegExp(escapeRegex(q), "i");
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

export function paginated<T>(rows: T[], total: number, params: Pick<ListParams, "page" | "pageSize">): Paginated<T> {
  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export function skipFor(params: Pick<ListParams, "page" | "pageSize">) {
  return (params.page - 1) * params.pageSize;
}
