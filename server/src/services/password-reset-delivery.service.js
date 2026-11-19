
import { env, isEmailConfigured } from "../config/env.js";
import { sendTransactionalEmail } from "./email-transport.service.js";

export async function sendPasswordResetEmail({ email, name, token }) {
  if (
    typeof email !== "string" ||
    typeof token !== "string" ||
    token.length === 0
  ) {
    throw new TypeError("Valid email and reset token are required.");
  }

  const resetUrl = new URL("/reset-password", env.CORS_ORIGIN);
  resetUrl.searchParams.set("token", token);

  if (!isEmailConfigured && env.NODE_ENV === "development") {
    console.info("\n========== LINKFORGE PASSWORD RESET (DEVELOPMENT) ==========");
    console.info(`Recipient: ${email}`);
    console.info(`Name: ${name || "User"}`);
    console.info(`Reset link: ${resetUrl.toString()}`);
    console.info("=============================================================\n");

    return { delivered: true, mode: "development-console" };
  }

  return sendTransactionalEmail({
    email,
    name,
    subject: "Reset your LinkForge password",
    message:
      "We received a request to reset your LinkForge password. Use the button below to choose a new password. This link can only be used once.",
    buttonLabel: "Reset Password",
    actionUrl: resetUrl.toString(),
  });
}
