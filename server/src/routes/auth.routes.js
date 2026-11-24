import { Router } from "express";

import {
  register,
  verifyEmail,
  login,
  googleLogin,
  refresh,
  logout,
  getCurrentUser,
  updateCurrentUser,
} from "../controllers/auth.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

import { requireTrustedOrigin } from "../middleware/trusted-origin.middleware.js";

import {
  registerRateLimiter,
  verifyEmailRateLimiter,
  loginRateLimiter,
  googleLoginRateLimiter,
  refreshRateLimiter,
} from "../middleware/auth-rate-limit.middleware.js";

const router = Router();

// Public authentication endpoints.
router.post("/register", requireTrustedOrigin, registerRateLimiter, register);

router.post(
  "/verify-email",
  requireTrustedOrigin,
  verifyEmailRateLimiter,
  verifyEmail,
);

router.post("/login", requireTrustedOrigin, loginRateLimiter, login);

router.post(
  "/google",
  requireTrustedOrigin,
  googleLoginRateLimiter,
  googleLogin,
);

router.post("/refresh", requireTrustedOrigin, refreshRateLimiter, refresh);

// Authenticated endpoints.
router.post("/logout", requireTrustedOrigin, authenticate, logout);

router.get("/me", authenticate, getCurrentUser);

router.patch("/me", requireTrustedOrigin, authenticate, updateCurrentUser);

export default router;
