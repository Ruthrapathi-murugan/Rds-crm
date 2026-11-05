import { z } from "zod";
import { COMMUNICATION_TYPES, CUSTOMER_TYPES, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import {
  dateTimeInput,
  moneyInput,
  optionalDateTimeInput,
  optionalEmail,
  optionalObjectId,
  optionalPhone,
  optionalText,
  phone,
  requiredText,
} from "./common";

export const leadFormSchema = z.object({
  contactName: requiredText("Contact name", 120),
  businessName: optionalText(200),
  phone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  location: optionalText(200),
  interestedService: optionalObjectId,
  source: z.enum(LEAD_SOURCES, { error: "Choose where the lead came from" }),
  estimatedValue: moneyInput,
  status: z.enum(LEAD_STATUSES),
  assignedTo: optionalObjectId,
  nextFollowUpAt: optionalDateTimeInput,
  notes: optionalText(5000),
});
export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormData = z.output<typeof leadFormSchema>;

export const leadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    lostReason: optionalText(500),
    nextFollowUpAt: optionalDateTimeInput,
  })
  .refine((v) => v.status !== "follow_up" || v.nextFollowUpAt, {
    path: ["nextFollowUpAt"],
    message: "Choose when to follow up",
  });
export type LeadStatusInput = z.input<typeof leadStatusSchema>;

export const communicationFormSchema = z.object({
  type: z.enum(COMMUNICATION_TYPES),
  summary: requiredText("Summary", 2000),
  occurredAt: dateTimeInput,
  nextFollowUpAt: optionalDateTimeInput,
});
export type CommunicationFormInput = z.input<typeof communicationFormSchema>;

export const convertLeadSchema = z
  .object({
    customerType: z.enum(CUSTOMER_TYPES),
    createProject: z.boolean(),
    projectName: optionalText(200),
    projectService: optionalObjectId,
    quotedAmount: moneyInput,
  })
  .refine((v) => !v.createProject || v.projectName, {
    path: ["projectName"],
    message: "Project name is required",
  });
export type ConvertLeadInput = z.input<typeof convertLeadSchema>;
export type ConvertLeadData = z.output<typeof convertLeadSchema>;
