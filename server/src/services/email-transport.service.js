
import nodemailer from "nodemailer";
import { env, isEmailConfigured } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!isEmailConfigured) {
    throw new Error("SMTP email delivery is not configured.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE,
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_APP_PASSWORD,
      },
    });
  }

  return transporter;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

export async function sendTransactionalEmail({
  email,
  name,
  subject,
  message,
  buttonLabel,
  actionUrl,
}) {
  if (
    typeof email !== "string" ||
    typeof subject !== "string" ||
    typeof message !== "string" ||
    typeof buttonLabel !== "string" ||
    typeof actionUrl !== "string"
  ) {
    throw new TypeError("Invalid transactional email data.");
  }

  if (!isEmailConfigured) {
    if (env.NODE_ENV !== "development") {
      throw new Error("SMTP email delivery is not configured.");
    }

    console.info(
      `Email delivery is not configured. Development link: ${actionUrl}`,
    );

    return { delivered: true, mode: "development-console" };
  }

  const safeName = escapeHtml(name || "User");
  const safeMessage = escapeHtml(message);
  const safeButtonLabel = escapeHtml(buttonLabel);
  const safeActionUrl = escapeHtml(actionUrl);

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
        <div style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:12px;">
          <h1 style="margin:0 0 24px;color:#111827;font-size:24px;">LinkForge</h1>
          <p style="font-size:16px;">Hello ${safeName},</p>
          <p style="font-size:15px;line-height:1.6;">${safeMessage}</p>
          <p style="margin:28px 0;">
            <a href="${safeActionUrl}" style="display:inline-block;padding:13px 22px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:7px;font-weight:bold;">
              ${safeButtonLabel}
            </a>
          </p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;">
            If the button does not work, copy and paste this URL into your browser:
            <br />
            <a href="${safeActionUrl}" style="color:#4f46e5;word-break:break-all;">${safeActionUrl}</a>
          </p>
          <p style="font-size:13px;color:#6b7280;">
            If you did not request this email, you can safely ignore it.
          </p>
          <hr style="margin:28px 0;border:0;border-top:1px solid #e5e7eb;" />
          <p style="font-size:12px;color:#9ca3af;">LinkForge Account Security</p>
        </div>
      </body>
    </html>
  `;

  const text = [
    `Hello ${name || "User"},`,
    "",
    message,
    "",
    `${buttonLabel}: ${actionUrl}`,
    "",
    "If you did not request this email, you can safely ignore it.",
    "",
    "LinkForge Account Security",
  ].join("\n");

  const info = await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject,
    text,
    html,
  });

  if (!info.accepted?.includes(email)) {
    throw new Error("The email provider did not accept the recipient.");
  }

  return {
    delivered: true,
    mode: "smtp",
    messageId: info.messageId,
  };
}
