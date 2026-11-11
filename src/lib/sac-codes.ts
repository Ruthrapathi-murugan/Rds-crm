import type { Option } from "@/types";

/**
 * Common GST SAC codes (Chapter 99, services) for the kinds of work RDS bills:
 * web and IT, hosting, digital marketing, consulting and hospitality support.
 * A starting point for the picker, not tax advice: any other 4–8 digit code
 * can still be typed in. Confirm the right code with a tax adviser.
 */
export const SAC_CODES: { code: string; name: string }[] = [
  { code: "998311", name: "Management consulting and management services" },
  { code: "998312", name: "Business consulting services, including public relations" },
  { code: "998313", name: "IT consulting and support services" },
  { code: "998314", name: "IT design and development services (websites, apps, software)" },
  { code: "998315", name: "Hosting and IT infrastructure provisioning services" },
  { code: "998316", name: "IT infrastructure and network management services" },
  { code: "998319", name: "Other information technology services" },
  { code: "998361", name: "Advertising services" },
  { code: "998365", name: "Sale of internet advertising space or time" },
  { code: "998371", name: "Market research services" },
  { code: "998391", name: "Specialty design services, including graphic design" },
  { code: "998397", name: "Sponsorship services and brand promotion" },
  { code: "998399", name: "Other professional, technical and business services" },
  { code: "998552", name: "Reservation services for accommodation, cruises and package tours" },
  { code: "998555", name: "Tourism promotion and visitor information services" },
  { code: "998599", name: "Other support services" },
  { code: "999293", name: "Commercial training and coaching services" },
];

export const SAC_OPTIONS: Option[] = SAC_CODES.map((c) => ({ value: c.code, label: c.code, description: c.name }));

export const SAC_PATTERN = /^\d{4,8}$/;

/** Lets the picker accept a code that is not in the list ("Use code 9983…"). */
export function customSacOption(query: string): Option | null {
  const code = query.trim();
  return SAC_PATTERN.test(code) ? { value: code, label: code, description: "Use this code (not in the list)" } : null;
}
