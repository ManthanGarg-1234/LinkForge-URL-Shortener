import "dotenv/config";
import { z } from "zod";

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

const redisUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const url = new URL(value);

        return (
          ["redis:", "rediss:"].includes(url.protocol) && Boolean(url.hostname)
        );
      } catch {
        return false;
      }
    },
    {
      message: "REDIS_URL must be a valid redis:// or rediss:// URL.",
    },
  );

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    PORT: z.coerce.number().int().min(1).max(65535).default(5000),

    CORS_ORIGIN: z.url().default("http://localhost:5173"),

    APP_BASE_URL: appBaseUrlSchema.default("http://localhost:5000"),

    // Redis
    REDIS_URL: redisUrlSchema.default("redis://127.0.0.1:6379"),

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

    AUTH_ISSUER: z.string().min(1).default("linkforge-api"),

    AUTH_AUDIENCE: z.string().min(1).default("linkforge-client"),

    // Firebase Authentication
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),

    FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),

    // Brevo transactional email API
    BREVO_API_KEY: z.string().min(1).optional(),

    EMAIL_FROM: z.string().email().optional(),

    EMAIL_FROM_NAME: z.string().min(1).default("LinkForge"),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === "production" && !values.AUTH_ACCESS_TOKEN_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_ACCESS_TOKEN_SECRET"],
        message: "AUTH_ACCESS_TOKEN_SECRET is required in production.",
      });
    }

    // Firebase settings must be configured together.
    const firebaseValues = [
      values.FIREBASE_PROJECT_ID,
      values.FIREBASE_SERVICE_ACCOUNT_PATH,
    ];

    const configuredFirebaseValues = firebaseValues.filter(Boolean).length;

    if (configuredFirebaseValues !== 0 && configuredFirebaseValues !== 2) {
      context.addIssue({
        code: "custom",
        path: ["FIREBASE_PROJECT_ID"],
        message:
          "FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH must be configured together.",
      });
    }

    // Brevo API key and sender address must be configured together.
    const emailValues = [values.BREVO_API_KEY, values.EMAIL_FROM];

    const configuredEmailValues = emailValues.filter(Boolean).length;

    if (configuredEmailValues !== 0 && configuredEmailValues !== 2) {
      context.addIssue({
        code: "custom",
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY and EMAIL_FROM must be configured together.",
      });
    }

    if (values.NODE_ENV === "production" && configuredEmailValues !== 2) {
      context.addIssue({
        code: "custom",
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY and EMAIL_FROM are required in production.",
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

export const isEmailConfigured = Boolean(env.BREVO_API_KEY && env.EMAIL_FROM);
