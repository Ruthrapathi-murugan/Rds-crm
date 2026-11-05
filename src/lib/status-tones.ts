import type {
  CustomerStatus,
  InvoiceStatus,
  LeadStatus,
  PaymentStatus,
  Priority,
  ProjectStatus,
  QuotationStatus,
  TaskStatus,
} from "@/lib/constants";

/**
 * Badge tones. Status is always shown as a text label with a coloured dot,
 * never colour alone.
 */
export type Tone = "neutral" | "info" | "primary" | "success" | "warning" | "danger" | "violet" | "muted";

export const LEAD_STATUS_TONES: Record<LeadStatus, Tone> = {
  new: "info",
  contacted: "primary",
  qualified: "violet",
  follow_up: "warning",
  quotation_sent: "primary",
  won: "success",
  lost: "muted",
};

export const CUSTOMER_STATUS_TONES: Record<CustomerStatus, Tone> = { active: "success", inactive: "muted" };

export const PROJECT_STATUS_TONES: Record<ProjectStatus, Tone> = {
  not_started: "neutral",
  in_progress: "info",
  waiting_for_client: "warning",
  on_hold: "violet",
  completed: "success",
  cancelled: "muted",
};

export const TASK_STATUS_TONES: Record<TaskStatus, Tone> = {
  todo: "neutral",
  in_progress: "info",
  completed: "success",
  cancelled: "muted",
};

export const PRIORITY_TONES: Record<Priority, Tone> = {
  low: "muted",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export const QUOTATION_STATUS_TONES: Record<QuotationStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  rejected: "danger",
  expired: "muted",
  converted: "violet",
};

export const INVOICE_STATUS_TONES: Record<InvoiceStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "muted",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = { recorded: "success", voided: "muted" };
