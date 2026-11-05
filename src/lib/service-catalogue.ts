import type { ServiceCategory } from "@/lib/constants";

/**
 * The RDS service catalogue used to seed a new database. Prices start at
 * zero and SAC codes blank: admins set them under Services, after
 * confirming the applicable codes and rates with their tax adviser.
 */
export const SERVICE_CATALOGUE: { category: ServiceCategory; name: string; description: string; pricingUnit: "one_time" | "monthly" }[] = [
  { category: "web_development", name: "Business Website", description: "Responsive multi-page website for a business, with contact forms and basic SEO.", pricingUnit: "one_time" },
  { category: "web_development", name: "Hotel Website", description: "Hotel website with rooms, gallery, enquiry and booking-engine integration.", pricingUnit: "one_time" },
  { category: "web_development", name: "E-commerce Website", description: "Online store with catalogue, cart, payment gateway and order management.", pricingUnit: "one_time" },
  { category: "web_development", name: "Custom Web Application", description: "Bespoke web application built to the client's workflow.", pricingUnit: "one_time" },
  { category: "web_development", name: "Website Maintenance", description: "Updates, backups, security patches and content changes.", pricingUnit: "monthly" },
  { category: "hotel_management", name: "OTA Account Setup", description: "Listing setup across online travel agencies with photos, rates and policies.", pricingUnit: "one_time" },
  { category: "hotel_management", name: "Booking.com Management", description: "Ongoing Booking.com listing, rates, availability and review management.", pricingUnit: "monthly" },
  { category: "hotel_management", name: "MakeMyTrip and Goibibo Management", description: "Ongoing MakeMyTrip and Goibibo listing, inventory and promotion management.", pricingUnit: "monthly" },
  { category: "hotel_management", name: "Agoda Management", description: "Ongoing Agoda listing, rate and availability management.", pricingUnit: "monthly" },
  { category: "hotel_management", name: "Hotel Website and Direct Booking", description: "Direct-booking website with booking engine to reduce OTA commissions.", pricingUnit: "one_time" },
  { category: "hotel_management", name: "Hotel Revenue Management", description: "Pricing strategy, rate parity and occupancy optimisation.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Search Engine Optimization", description: "On-page, technical and local SEO with monthly reporting.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Google Business Profile Optimization", description: "Profile setup, optimisation, posts and review management.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Social Media Management", description: "Content calendar, creatives and posting across social platforms.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Google Ads", description: "Search and display campaign setup and management.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Meta Ads", description: "Facebook and Instagram ad campaign setup and management.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Content Marketing", description: "Blog articles, landing-page copy and content strategy.", pricingUnit: "monthly" },
  { category: "digital_marketing", name: "Analytics and Reporting", description: "Analytics setup, conversion tracking and monthly performance reports.", pricingUnit: "monthly" },
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}
