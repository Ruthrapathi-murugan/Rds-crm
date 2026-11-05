import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Noto Sans for PDFs. The latin subset covers text; latin-ext supplies the
 * ₹ glyph, used through react-pdf's per-glyph font fallback. Files are read
 * from node_modules and inlined as data URLs; `outputFileTracingIncludes` in
 * next.config.ts ships them with the serverless functions.
 */
const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files");

let registered = false;

function dataUrl(file: string) {
  return `data:font/woff;base64,${readFileSync(path.join(FONT_DIR, file)).toString("base64")}`;
}

export const PDF_FONT_FAMILY = ["NotoSans", "NotoSansExt"];

export function registerPdfFonts() {
  if (registered) return;
  for (const [family, subset] of [
    ["NotoSans", "latin"],
    ["NotoSansExt", "latin-ext"],
  ] as const) {
    Font.register({
      family,
      fonts: [
        { src: dataUrl(`noto-sans-${subset}-400-normal.woff`), fontWeight: 400 },
        { src: dataUrl(`noto-sans-${subset}-600-normal.woff`), fontWeight: 600 },
        { src: dataUrl(`noto-sans-${subset}-700-normal.woff`), fontWeight: 700 },
      ],
    });
  }
  // Long words (emails, GSTINs) should never be hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
