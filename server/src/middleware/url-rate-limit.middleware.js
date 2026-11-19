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