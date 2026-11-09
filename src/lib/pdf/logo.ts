import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Company logo for PDFs, read once from public/brand/ and inlined as a data
 * URL (react-pdf accepts PNG and JPEG). Returns null when no logo file exists,
 * so documents still render without one. `outputFileTracingIncludes` in
 * next.config.ts ships the file with the API functions.
 */
const CANDIDATES = [
  ["logo.png", "image/png"],
  ["logo.jpg", "image/jpeg"],
  ["logo.jpeg", "image/jpeg"],
] as const;

let cached: string | null | undefined;

export function getPdfLogo(): string | null {
  if (cached !== undefined) return cached;
  cached = null;
  for (const [file, mime] of CANDIDATES) {
    const full = path.join(process.cwd(), "public", "brand", file);
    if (existsSync(full)) {
      cached = `data:${mime};base64,${readFileSync(full).toString("base64")}`;
      break;
    }
  }
  return cached;
}
