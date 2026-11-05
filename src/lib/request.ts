import "server-only";
import { headers } from "next/headers";

/**
 * Client IP for rate limiting and the audit log.
 *
 * Headers a client can forge are not trusted blindly:
 * - On Vercel, `x-vercel-forwarded-for` / `x-real-ip` are set by the platform.
 * - Otherwise the right-most `x-forwarded-for` entry is used: it was appended
 *   by the nearest proxy, while anything to its left can be supplied by the
 *   client.
 */
export function clientIpFrom(h: Headers): string {
  const pick = (value: string | null | undefined) => value?.trim().slice(0, 64) || null;
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return pick(vercel.split(",")[0])!;
  const realIp = pick(h.get("x-real-ip"));
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const last = pick(hops.at(-1));
    if (last) return last;
  }
  return "unknown";
}

export async function getRequestMeta() {
  const h = await headers();
  return {
    ipAddress: clientIpFrom(h),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  };
}
