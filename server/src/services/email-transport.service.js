import { env, isEmailConfigured } from "../config/env.js";

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
      throw new Error("Brevo email delivery is not configured.");
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
  const safeSubject = escapeHtml(subject);

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeSubject}</title>
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

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: env.EMAIL_FROM_NAME,
        email: env.EMAIL_FROM,
      },
      to: [
        {
          email,
          name: name || "User",
        },
      ],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Brevo email delivery failed with HTTP ${response.status}.`,
    );
  }

  const result = await response.json();

  if (typeof result.messageId !== "string" || result.messageId.length === 0) {
    throw new Error("Brevo accepted no verifiable message identifier.");
  }

  return {
    delivered: true,
    mode: "brevo",
    messageId: result.messageId,
  };
}
