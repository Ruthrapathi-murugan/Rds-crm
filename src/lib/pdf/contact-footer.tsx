import "server-only";
import type { ReactNode } from "react";
import { Circle, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { PDF_COLORS, pdfStyles as s } from "./styles";

/** Lucide-style outline icons (24×24 grid) drawn as vector paths. */
const ICON = { width: 9, height: 9, viewBox: "0 0 24 24" } as const;
const STROKE = { stroke: PDF_COLORS.text, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function PinIcon() {
  return (
    <Svg {...ICON}>
      <Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" {...STROKE} />
      <Circle cx="12" cy="10" r="3" {...STROKE} />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg {...ICON}>
      <Rect x="2" y="4" width="20" height="16" rx="2" {...STROKE} />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...STROKE} />
    </Svg>
  );
}

function GlobeIcon() {
  return (
    <Svg {...ICON}>
      <Circle cx="12" cy="12" r="10" {...STROKE} />
      <Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" {...STROKE} />
      <Path d="M2 12h20" {...STROKE} />
    </Svg>
  );
}

/**
 * Page footer repeated on every page: accent bar, then the seller's location,
 * email and website separated by bars, then a small reference line.
 * Keep `meta` static: react-pdf silently drops fixed blocks containing
 * `render` props (page numbers) when the page style sets a lineHeight.
 */
export function ContactFooter({
  location,
  email,
  website,
  meta,
}: {
  location?: string;
  email?: string;
  website?: string;
  /** Small muted line under the contact strip (document number, page count…). */
  meta: React.ReactNode;
}) {
  const items = [
    location ? { key: "location", icon: <PinIcon />, text: location } : null,
    email ? { key: "email", icon: <MailIcon />, text: email } : null,
    website ? { key: "website", icon: <GlobeIcon />, text: website } : null,
  ].filter((item) => item !== null);

  return (
    <>
      <View style={s.contactFooter} fixed>
        <View style={s.accentBar} />
        {items.length > 0 && (
          <View style={s.contactStrip}>
            {items.map((item, index) => (
              <View key={item.key} style={s.contactItem}>
                {index > 0 && <Text style={s.contactDivider}>|</Text>}
                {item.icon}
                <Text>{item.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={s.footerMeta} fixed>
        {meta}
      </View>
    </>
  );
}

/** "Thank you" line (with optional terms above it) and a signature space, kept together on the last page. */
export function ClosingBlock({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <View style={s.closing} wrap={false}>
      <View style={{ flex: 1, paddingRight: 24 }}>
        {children}
        <Text style={[s.closingMessage, children ? { marginTop: 10 } : {}]}>{message}</Text>
      </View>
      <View style={s.signature}>
        <View style={s.signatureLine} />
        <Text style={s.signatureLabel}>Authorised Sign</Text>
      </View>
    </View>
  );
}
