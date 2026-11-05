"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Option } from "@/types";

// Small lists (team members, services) change rarely; share one request per page view.
const cache = new Map<string, Promise<Option[]>>();

/** Loads an Option[] endpoint once and shares it across components. */
export function useOptions(url: string | null) {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(Boolean(url));

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let request = cache.get(url);
    if (!request) {
      request = api<Option[]>(url);
      cache.set(url, request);
      request.catch(() => cache.delete(url));
    }
    request
      .then((result) => !cancelled && setOptions(result))
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { options, loading };
}

/** Clears cached option lists after a change (e.g. a new service was added). */
export function invalidateOptions(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}
