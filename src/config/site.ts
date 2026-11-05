/**
 * Static brand and product constants.
 * Editable business details (address, GSTIN, bank info, invoice terms) live
 * in the CompanySettings collection so admins can change them without a
 * deploy; these values are only the defaults and fixed product identity.
 */
export const siteConfig = {
  productName: "RDS CRM",
  companyName: "Ruthra Digital Solutions",
  shortName: "RDS",
  description:
    "Customer relationship management for Ruthra Digital Solutions — leads, customers, projects, quotations, invoices and payments in one place.",
  location: "Palani, Tamil Nadu, India",
  timeZone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
} as const;

export const businessServiceAreas = [
  "Web Development and Website Design",
  "Hotel Management Consulting and OTA Management",
  "Digital Marketing and SEO",
  "Google Business Profile Management",
  "Social Media Marketing",
  "Website Maintenance and Support",
] as const;
