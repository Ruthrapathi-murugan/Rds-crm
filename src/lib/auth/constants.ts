/**
 * Session cookie name. In production the `__Host-` prefix makes browsers
 * enforce Secure, Path=/ and no Domain attribute, so the cookie cannot be set
 * or overwritten by another subdomain. Kept free of server-only imports so
 * the proxy can use it.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-rds_session" : "rds_session";

/** Sessions slide forward on activity up to this idle lifetime… */
export const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** …but never beyond this absolute lifetime from sign-in. */
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Avoid a database write on every request: refresh at most this often. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
