import { describe, expect, it } from "vitest";
import { appUrl, escapeHtml, leadFollowUpEmail, renderEmail, taskReminderEmail } from "@/lib/email-templates";
import { sendMail } from "@/lib/mailer";

describe("escapeHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y' \``)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39; &#96;",
    );
  });

  it("handles non-strings and empty values", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("renderEmail", () => {
  const hostile = `<img src=x onerror="alert(1)">`;

  it("escapes every interpolated value", () => {
    const { html } = renderEmail({
      companyName: hostile,
      heading: hostile,
      intro: hostile,
      rows: [{ label: hostile, value: hostile }],
      cta: { label: hostile, url: "/tasks" },
      footer: hostile,
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("uses the brand colour, company name and an absolute CTA link", () => {
    const { html, text } = renderEmail({
      companyName: "Ruthra Digital Solutions",
      heading: "Task reminder",
      intro: "Line one\nLine two",
      rows: [
        { label: "Task", value: "Call back" },
        { label: "Empty", value: "" },
      ],
      cta: { label: "Open tasks", url: "/tasks" },
    });
    expect(html).toContain("#3b46b8");
    expect(html).toContain("Ruthra Digital Solutions");
    expect(html).toContain('href="http://localhost:3000/tasks"');
    expect(html).toContain("Line one<br>Line two");
    expect(html).not.toContain(">Empty<");
    expect(text).toContain("Task: Call back");
    expect(text).toContain("Open tasks: http://localhost:3000/tasks");
    expect(text).not.toContain("Empty:");
  });

  it("never links to non-http URLs", () => {
    expect(appUrl("javascript:alert(1)")).toBe("http://localhost:3000/");
    expect(appUrl("/leads/abc")).toBe("http://localhost:3000/leads/abc");
    const { html } = renderEmail({ companyName: "RDS", heading: "x", intro: "y", cta: { label: "Go", url: "javascript:alert(1)" } });
    expect(html).not.toContain("javascript:");
  });
});

describe("reminder emails", () => {
  it("builds a task reminder with the IST due time", () => {
    const mail = taskReminderEmail({
      companyName: "RDS",
      recipientName: "Kavin",
      taskTitle: "Send <proposal>",
      dueAt: new Date("2026-10-23T09:30:00.000Z"),
      priorityLabel: "High",
    });
    expect(mail.subject).toBe("Reminder: Send <proposal> (due 23 Oct 2026, 3:00 PM)");
    expect(mail.html).toContain("Send &lt;proposal&gt;");
    expect(mail.html).toContain("23 Oct 2026, 3:00 PM IST");
    expect(mail.text).toContain("Priority: High");
  });

  it("builds a lead follow-up email linking to the lead", () => {
    const mail = leadFollowUpEmail({
      companyName: "RDS",
      recipientName: "Kavin",
      leadId: "6650f1d2a1b2c3d4e5f60718",
      contactName: "Priya Raman",
      businessName: "Hotel Sri Murugan",
      phone: "98765 43210",
      followUpAt: new Date("2026-10-23T05:30:00.000Z"),
    });
    expect(mail.subject).toBe("Follow-up due: Priya Raman (Hotel Sri Murugan)");
    expect(mail.html).toContain('href="http://localhost:3000/leads/6650f1d2a1b2c3d4e5f60718"');
    expect(mail.text).toContain("Follow-up: 23 Oct 2026, 11:00 AM IST");
  });
});

describe("sendMail", () => {
  it("reports not_configured without throwing when SMTP is not set", async () => {
    const result = await sendMail({ to: "a@example.com", subject: "x", html: "<p>x</p>", text: "x" });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
  });
});
