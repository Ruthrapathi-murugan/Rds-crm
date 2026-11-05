import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * Fast, optimistic gate: sends visitors without a session cookie to the
 * login page. It does not trust the cookie — every page, route handler and
 * service validates the session against the database before doing anything.
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health", "/api/cron"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { message: "Please sign in to continue.", code: "unauthorized" } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$).*)"],
};
