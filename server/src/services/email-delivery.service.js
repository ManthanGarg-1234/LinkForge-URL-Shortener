
import { env, isEmailConfigured } from "../config/env.js";
import { sendTransactionalEmail } from "./email-transport.service.js";

export async function sendVerificationEmail({ email, name, token }) {
  if (
    typeof email !== "string" ||
    typeof token !== "string" ||
    token.length === 0
  ) {
    throw new TypeError("Valid email and verification token are required.");
  }

  const verificationUrl = new URL("/verify-email", env.CORS_ORIGIN);
  verificationUrl.searchParams.set("token", token);

  if (!isEmailConfigured && env.NODE_ENV === "development") {
    console.info("\n========== LINKFORGE EMAIL (DEVELOPMENT) ==========");
    console.info(`Recipient: ${email}`);
    console.info(`Name: ${name || "User"}`);
    console.info(`Verification link: ${verificationUrl.toString()}`);
    console.info("===================================================\n");

    return { delivered: true, mode: "development-console" };
  }

  return sendTransactionalEmail({
    email,
    name,
    subject: "Verify your LinkForge email address",
    message:
      "Please verify your email address to activate your LinkForge account.",
    buttonLabel: "Verify Email Address",
    actionUrl: verificationUrl.toString(),
  });
}
