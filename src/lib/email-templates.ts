import "server-only";
import { getServerEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/utils/date";

/**
 * Branded transactional email layout. Every interpolated value is escaped;
 * styles are inline because many mail clients strip <style> blocks.
 */

const BRAND = "#3b46b8";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG = "#f4f5fb";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escapes text for safe use in HTML element content and quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}

/** Escaped text with line breaks preserved. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

/**
 * Absolute link into the app. Relative paths are resolved against APP_URL;
 * anything that is not http(s) is replaced with the app's home page.
 */
export function appUrl(pathOrUrl = "/"): string {
  const base = getServerEnv().APP_URL;
  try {
    const url = new URL(pathOrUrl, `${base}/`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : `${base}/`;
  } catch {
    return `${base}/`;
  }
}

export type EmailRow = { label: string; value: string };

export type EmailContent = {
  companyName: string;
  heading: string;
  intro: string;
  rows?: EmailRow[];
  cta?: { label: string; url: string };
  /** A one-time code shown large and monospaced below the intro. */
  code?: string;
  footer?: string;
  /** Hidden inbox preview text; defaults to the intro. */
  preheader?: string;
};

export type RenderedEmail = { html: string; text: string };

export function renderEmail(content: EmailContent): RenderedEmail {
  const company = content.companyName.trim() || "RDS CRM";
  const rows = (content.rows ?? []).filter((r) => r.value !== "");
  const ctaUrl = content.cta ? appUrl(content.cta.url) : null;
  const footer = content.footer ?? `You are receiving this because you have an account on the ${company} CRM.`;

  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 4px;border:1px solid ${BORDER};border-radius:8px">${rows
        .map(
          (row, i) =>
            `<tr><td style="padding:10px 14px;${i ? `border-top:1px solid ${BORDER};` : ""}font-size:13px;color:${MUTED};width:38%;vertical-align:top">${escapeHtml(
              row.label,
            )}</td><td style="padding:10px 14px;${i ? `border-top:1px solid ${BORDER};` : ""}font-size:14px;color:${TEXT};vertical-align:top">${escapeMultiline(
              row.value,
            )}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const ctaHtml =
    content.cta && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:8px;background:${BRAND}"><a href="${escapeHtml(
          ctaUrl,
        )}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(
          content.cta.label,
        )}</a></td></tr></table>`
      : "";

  const codeHtml = content.code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:${BG};border:1px solid ${BORDER};border-radius:10px;padding:14px 22px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${TEXT}">${escapeHtml(
        content.code,
      )}</td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader ?? content.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 14px;font-size:15px;font-weight:700;color:${BRAND};letter-spacing:.2px">${escapeHtml(company)}</td></tr>
<tr><td style="background:#ffffff;border-radius:12px;border-top:4px solid ${BRAND};padding:28px 24px;box-shadow:0 1px 3px rgba(17,24,39,.06)">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:${TEXT}">${escapeHtml(content.heading)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:${TEXT}">${escapeMultiline(content.intro)}</p>
${codeHtml}${rowsHtml}${ctaHtml}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:${MUTED}">${escapeMultiline(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    company,
    "",
    content.heading,
    "",
    content.intro,
    ...(content.code ? ["", `Code: ${content.code}`] : []),
    ...(rows.length ? ["", ...rows.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(content.cta && ctaUrl ? ["", `${content.cta.label}: ${ctaUrl}`] : []),
    "",
    "—",
    footer,
  ].join("\n");

  return { html, text };
}

export type EmailWithSubject = RenderedEmail & { subject: string };

export function taskReminderEmail(input: {
  companyName: string;
  recipientName: string;
  taskTitle: string;
  dueAt: Date | string;
  priorityLabel?: string;
  relatedTo?: string;
}): EmailWithSubject {
  const due = formatDateTime(input.dueAt);
  return {
    subject: `Reminder: ${input.taskTitle} (due ${due})`,
    ...renderEmail({
      companyName: input.companyName,
      heading: "Task reminder",
      intro: `Hi ${input.recipientName}, this is a reminder about a task assigned to you.`,
      rows: [
        { label: "Task", value: input.taskTitle },
        { label: "Due", value: `${due} IST` },
        { label: "Priority", value: input.priorityLabel ?? "" },
        { label: "Related to", value: input.relatedTo ?? "" },
      ],
      cta: { label: "Open tasks", url: "/tasks" },
    }),
  };
}

export function leadFollowUpEmail(input: {
  companyName: string;
  recipientName: string;
  leadId: string;
  contactName: string;
  businessName?: string;
  phone?: string;
  followUpAt: Date | string;
}): EmailWithSubject {
  const when = formatDateTime(input.followUpAt);
  return {
    subject: `Follow-up due: ${input.contactName}${input.businessName ? ` (${input.businessName})` : ""}`,
    ...renderEmail({
      companyName: input.companyName,
      heading: "Lead follow-up due",
      intro: `Hi ${input.recipientName}, a follow-up with one of your leads is due.`,
      rows: [
        { label: "Contact", value: input.contactName },
        { label: "Business", value: input.businessName ?? "" },
        { label: "Phone", value: input.phone ?? "" },
        { label: "Follow-up", value: `${when} IST` },
      ],
      cta: { label: "Open lead", url: `/leads/${encodeURIComponent(input.leadId)}` },
    }),
  };
}

export function passwordResetOtpEmail(input: {
  companyName: string;
  recipientName: string;
  otp: string;
  validMinutes: number;
}): EmailWithSubject {
  return {
    subject: "Your password reset code",
    ...renderEmail({
      companyName: input.companyName,
      heading: "Reset your password",
      intro: `Hi ${input.recipientName}, use this code to reset your CRM password. It expires in ${input.validMinutes} minutes and can be used once.`,
      code: input.otp,
      preheader: `Your password reset code expires in ${input.validMinutes} minutes.`,
      footer:
        "If you did not ask to reset your password, you can ignore this email — your password will not change. Never share this code with anyone, including RDS staff.",
    }),
  };
}

export function passwordResetDoneEmail(input: {
  companyName: string;
  recipientName: string;
  changedAt: Date | string;
  ipAddress?: string;
}): EmailWithSubject {
  return {
    subject: "Your password was changed",
    ...renderEmail({
      companyName: input.companyName,
      heading: "Password changed",
      intro: `Hi ${input.recipientName}, the password for your CRM account was just reset. You have been signed out on all devices.`,
      rows: [
        { label: "When", value: `${formatDateTime(input.changedAt)} IST` },
        { label: "IP address", value: input.ipAddress ?? "" },
      ],
      cta: { label: "Sign in", url: "/login" },
      footer: "If you did not do this, contact your administrator immediately so the account can be secured.",
    }),
  };
}
