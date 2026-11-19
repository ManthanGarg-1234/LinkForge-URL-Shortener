
import { env } from "../config/env.js";

export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");

  const allowedOrigins = new Set([env.CORS_ORIGIN]);

  // Swagger UI runs on the API origin during local development.
  // Never allow this additional origin in production.
  if (env.NODE_ENV === "development") {
    allowedOrigins.add(env.APP_BASE_URL);
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "UNTRUSTED_ORIGIN",
        message: "Request origin is not allowed.",
      },
    });
  }

  return next();
}
