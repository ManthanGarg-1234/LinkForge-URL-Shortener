import { rateLimit } from "express-rate-limit";

export const urlCreationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "URL_CREATION_RATE_LIMIT_EXCEEDED",
      message: "Too many URLs created. Please try again later.",
    },
  },
});

export const abuseReportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "ABUSE_REPORT_RATE_LIMIT_EXCEEDED",
      message: "Too many abuse reports submitted. Please try again later.",
    },
  },
});