import nodemailer from "nodemailer";
import { logger } from "./logger";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER ?? "noreply@school.edu";

function isConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export async function sendStatusNotification({
  to,
  studentName,
  submissionId,
  status,
  notes,
}: {
  to: string;
  studentName: string;
  submissionId: string;
  status: "approved" | "rejected";
  notes: string | null;
}): Promise<void> {
  const subject =
    status === "approved"
      ? `Your volunteer hours submission has been approved — ${submissionId}`
      : `Your volunteer hours submission was not approved — ${submissionId}`;

  const statusLabel = status === "approved" ? "Approved" : "Not Approved";
  const statusColor = status === "approved" ? "#16a34a" : "#dc2626";

  const notesSection =
    notes && notes.trim()
      ? `
      <tr>
        <td style="padding: 16px 24px;">
          <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #374151;">Faculty Notes:</p>
          <p style="margin: 0; font-size: 14px; color: #4b5563; background: #f9fafb; border-left: 3px solid #d1d5db; padding: 12px 16px; border-radius: 4px;">${escapeHtml(notes.trim())}</p>
        </td>
      </tr>`
      : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: #1e40af; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Volunteer Hours Review</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 24px 8px;">
              <p style="margin: 0; font-size: 15px; color: #111827;">Hello ${studentName},</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 24px 16px;">
              <p style="margin: 0; font-size: 15px; color: #374151;">Your volunteer hours submission has been reviewed.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 24px 16px;">
              <table cellpadding="0" cellspacing="0" style="width: 100%; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Reference ID</p>
                    <p style="margin: 0; font-size: 14px; font-family: monospace; color: #111827;">${submissionId}</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: right;">
                    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Decision</p>
                    <span style="display: inline-block; padding: 4px 12px; background: ${statusColor}20; color: ${statusColor}; border-radius: 999px; font-size: 13px; font-weight: 600;">${statusLabel}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${notesSection}
          <tr>
            <td style="padding: 8px 24px 24px;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">If you have questions, please contact your faculty advisor or school office.</p>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">This is an automated message from the school volunteer hours system.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!isConfigured()) {
    logger.info(
      { to, submissionId, status },
      "Email not configured — skipping notification (set SMTP_HOST, SMTP_USER, SMTP_PASS to enable)"
    );
    return;
  }

  const transporter = createTransport();
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, html });
    logger.info({ to, submissionId, status }, "Status notification email sent");
  } catch (err) {
    logger.error({ err, to, submissionId }, "Failed to send status notification email");
  }
}
