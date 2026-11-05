/**
 * Domain enumerations shared by Mongoose models, Zod schemas and the UI.
 * Stored values are stable snake_case keys; labels are for display only.
 */

function labels<const T extends readonly string[]>(
  _values: T,
  map: { [K in T[number]]: string },
) {
  return map;
}

export function labelOf<T extends string>(map: Record<T, string>, value: T | null | undefined) {
  return value ? (map[value] ?? value) : "—";
}

export function optionsOf<T extends string>(values: readonly T[], map: Record<T, string>) {
  return values.map((value) => ({ value, label: map[value] }));
}

// ── Users ────────────────────────────────────────────────────────────────
export const ROLES = ["super_admin", "admin", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS = labels(ROLES, {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
});

// ── Leads ────────────────────────────────────────────────────────────────
export const LEAD_SOURCES = [
  "website",
  "whatsapp",
  "phone_call",
  "instagram",
  "facebook",
  "google_business_profile",
  "referral",
  "walk_in",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS = labels(LEAD_SOURCES, {
  website: "Website",
  whatsapp: "WhatsApp",
  phone_call: "Phone call",
  instagram: "Instagram",
  facebook: "Facebook",
  google_business_profile: "Google Business Profile",
  referral: "Referral",
  walk_in: "Walk-in",
  other: "Other",
});

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "follow_up",
  "quotation_sent",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABELS = labels(LEAD_STATUSES, {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  follow_up: "Follow-up",
  quotation_sent: "Quotation Sent",
  won: "Won",
  lost: "Lost",
});
/** Statuses that still need attention from the team. */
export const OPEN_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "follow_up",
  "quotation_sent",
] as const satisfies readonly LeadStatus[];

export const COMMUNICATION_TYPES = ["call", "whatsapp", "email", "meeting", "note"] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];
export const COMMUNICATION_TYPE_LABELS = labels(COMMUNICATION_TYPES, {
  call: "Phone call",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
});

// ── Customers ────────────────────────────────────────────────────────────
export const CUSTOMER_TYPES = [
  "hotel",
  "retail_shop",
  "startup",
  "small_business",
  "corporate",
  "individual",
  "other",
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABELS = labels(CUSTOMER_TYPES, {
  hotel: "Hotel",
  retail_shop: "Retail Shop",
  startup: "Startup",
  small_business: "Small Business",
  corporate: "Corporate",
  individual: "Individual",
  other: "Other",
});

export const CUSTOMER_STATUSES = ["active", "inactive"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export const CUSTOMER_STATUS_LABELS = labels(CUSTOMER_STATUSES, {
  active: "Active",
  inactive: "Inactive",
});

// ── Services ─────────────────────────────────────────────────────────────
export const SERVICE_CATEGORIES = ["web_development", "hotel_management", "digital_marketing"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export const SERVICE_CATEGORY_LABELS = labels(SERVICE_CATEGORIES, {
  web_development: "Web Development",
  hotel_management: "Hotel Management Services",
  digital_marketing: "Digital Marketing",
});

export const PRICING_UNITS = ["one_time", "monthly", "quarterly", "yearly"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];
export const PRICING_UNIT_LABELS = labels(PRICING_UNITS, {
  one_time: "One-time",
  monthly: "Per month",
  quarterly: "Per quarter",
  yearly: "Per year",
});

// ── Projects & tasks ─────────────────────────────────────────────────────
export const PROJECT_STATUSES = [
  "not_started",
  "in_progress",
  "waiting_for_client",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS = labels(PROJECT_STATUSES, {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting_for_client: "Waiting for Client",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
});
export const ACTIVE_PROJECT_STATUSES = [
  "not_started",
  "in_progress",
  "waiting_for_client",
  "on_hold",
] as const satisfies readonly ProjectStatus[];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS = labels(PRIORITIES, {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
});

export const TASK_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS = labels(TASK_STATUSES, {
  todo: "To Do",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
});
export const OPEN_TASK_STATUSES = ["todo", "in_progress"] as const satisfies readonly TaskStatus[];

/** Reminder lead times in minutes before the due time. */
export const REMINDER_OPTIONS = [
  { value: 0, label: "No reminder" },
  { value: 15, label: "15 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 180, label: "3 hours before" },
  { value: 1440, label: "1 day before" },
] as const;
export const REMINDER_MINUTES = REMINDER_OPTIONS.map((o) => o.value);

// ── Quotations, invoices, payments ───────────────────────────────────────
export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "converted"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export const QUOTATION_STATUS_LABELS = labels(QUOTATION_STATUSES, {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  converted: "Converted to Invoice",
});

/** Stored invoice statuses. "overdue" is derived at read time from the due date. */
export const INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const STORED_INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "cancelled",
] as const satisfies readonly InvoiceStatus[];
export type StoredInvoiceStatus = (typeof STORED_INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS = labels(INVOICE_STATUSES, {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
});
/** Issued invoices that still expect money. */
export const RECEIVABLE_INVOICE_STATUSES = ["sent", "partially_paid"] as const satisfies readonly StoredInvoiceStatus[];

export const TAX_MODES = ["none", "intra_state", "inter_state"] as const;
export type TaxMode = (typeof TAX_MODES)[number];
export const TAX_MODE_LABELS = labels(TAX_MODES, {
  none: "No GST",
  intra_state: "GST — within state (CGST + SGST)",
  inter_state: "GST — other state (IGST)",
});

export const PAYMENT_METHODS = ["bank_transfer", "upi", "cash", "card", "payment_gateway", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS = labels(PAYMENT_METHODS, {
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  cash: "Cash",
  card: "Card",
  payment_gateway: "Payment Gateway",
  other: "Other",
});

export const PAYMENT_STATUSES = ["recorded", "voided"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS = labels(PAYMENT_STATUSES, {
  recorded: "Recorded",
  voided: "Voided",
});

// ── Activity ─────────────────────────────────────────────────────────────
export const ENTITY_TYPES = [
  "user",
  "lead",
  "customer",
  "service",
  "project",
  "task",
  "quotation",
  "invoice",
  "payment",
  "settings",
  "auth",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// ── India ────────────────────────────────────────────────────────────────
/** States and union territories with their GST state codes. */
export const INDIAN_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
] as const;
export const INDIAN_STATE_NAMES = INDIAN_STATES.map((s) => s.name);

export function stateCodeOf(stateName: string | null | undefined): string | undefined {
  if (!stateName) return undefined;
  const needle = stateName.trim().toLowerCase();
  return INDIAN_STATES.find((s) => s.name.toLowerCase() === needle)?.code;
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Mobile or landline: optional +, then 7–15 digits with optional spaces or dashes. */
export const PHONE_PATTERN = /^\+?\d(?:[\s-]?\d){6,14}$/;
