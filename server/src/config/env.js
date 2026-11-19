
import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

// APP_BASE_URL must be an origin, not a URL containing a path or query.
const appBaseUrlSchema = z.url().refine(
  (value) => {
    try {
      const url = new URL(value);

      return (
        ["http:", "https:"].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  },
  {
    message:
      "APP_BASE_URL must be an HTTP(S) origin without credentials, path, query, or hash.",
  },
);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(5000),

    CORS_ORIGIN: z
      .url()
      .default("http://localhost:5173"),

    APP_BASE_URL: appBaseUrlSchema.default("http://localhost:5000"),

    // Authentication
    AUTH_ACCESS_TOKEN_SECRET: z.string().min(43).optional(),

    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(3600)
      .default(900),

    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(30),

    AUTH_ISSUER: z
      .string()
      .min(1)
      .default("linkforge-api"),

    AUTH_AUDIENCE: z
      .string()
      .min(1)
      .default("linkforge-client"),

    // Firebase Authentication
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),

    FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),

    // SMTP email configuration
    EMAIL_HOST: z.string().min(1).optional(),

    EMAIL_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(465),

    EMAIL_SECURE: booleanFromEnv,

    EMAIL_USER: z.string().email().optional(),

    EMAIL_APP_PASSWORD: z.string().min(1).optional(),

    EMAIL_FROM: z.string().min(1).optional(),
  })
  .superRefine((values, context) => {
    // Production must have a strong access-token secret.
    if (
      values.NODE_ENV === "production" &&
      !values.AUTH_ACCESS_TOKEN_SECRET
    ) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_ACCESS_TOKEN_SECRET"],
        message:
          "AUTH_ACCESS_TOKEN_SECRET is required in production.",
      });
    }

    // Firebase settings must be configured together.
    const firebaseValues = [
      values.FIREBASE_PROJECT_ID,
      values.FIREBASE_SERVICE_ACCOUNT_PATH,
    ];

    const configuredFirebaseValues =
      firebaseValues.filter(Boolean).length;

    if (
      configuredFirebaseValues !== 0 &&
      configuredFirebaseValues !== 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["FIREBASE_PROJECT_ID"],
        message:
          "FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH must be configured together.",
      });
    }

    // SMTP settings must be configured together.
    const emailValues = [
      values.EMAIL_HOST,
      values.EMAIL_USER,
      values.EMAIL_APP_PASSWORD,
      values.EMAIL_FROM,
    ];

    const configuredEmailValues =
      emailValues.filter(Boolean).length;

    if (
      configuredEmailValues !== 0 &&
      configuredEmailValues !== 4
    ) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_HOST"],
        message:
          "EMAIL_HOST, EMAIL_USER, EMAIL_APP_PASSWORD and EMAIL_FROM must be configured together.",
      });
    }

    // Production requires a complete SMTP configuration.
    if (
      values.NODE_ENV === "production" &&
      configuredEmailValues !== 4
    ) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_HOST"],
        message:
          "Complete SMTP email configuration is required in production.",
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze(result.data);

export const isEmailConfigured = Boolean(
  env.EMAIL_HOST &&
    env.EMAIL_USER &&
    env.EMAIL_APP_PASSWORD &&
    env.EMAIL_FROM,
);
