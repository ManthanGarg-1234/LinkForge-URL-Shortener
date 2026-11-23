
import { allowedOrigins } from "../config/env.js";

export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");

  if (!origin || !allowedOrigins.includes(origin)) {
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
