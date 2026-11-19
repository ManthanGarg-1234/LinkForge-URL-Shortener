import { rateLimit } from "express-rate-limit";

function createAuthRateLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,

    handler(req, res) {
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
        },
      });
    },
  });
}

// Login: maximum 5 attempts per 15 minutes per IP.
export const loginRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many login attempts. Please try again later.",
});

// Registration: maximum 5 attempts per hour per IP.
export const registerRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "Too many registration attempts. Please try again later.",
});

// Google login: maximum 5 attempts per 15 minutes per IP.
export const googleLoginRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many Google sign-in attempts. Please try again later.",
});

// Email verification: maximum 10 attempts per 15 minutes per IP.
export const verifyEmailRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many email verification attempts. Please try again later.",
});

// Refresh: maximum 30 attempts per minute per IP.
export const refreshRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: "Too many session refresh requests. Please try again later.",
});

// Forgot password: maximum 3 requests per hour per IP.
export const forgotPasswordRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  message: "Too many password recovery requests. Please try again later.",
});

// Reset password: maximum 5 attempts per 15 minutes per IP.
export const resetPasswordRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many password reset attempts. Please try again later.",
});