import { Router } from "express";

import {
  forgotPassword,
  completePasswordReset,
} from "../controllers/password-reset.controller.js";

import {
  requireTrustedOrigin,
} from "../middleware/trusted-origin.middleware.js";

import {
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} from "../middleware/auth-rate-limit.middleware.js";

const router = Router();

router.post(
  "/forgot-password",
  requireTrustedOrigin,
  forgotPasswordRateLimiter,
  forgotPassword,
);

router.post(
  "/reset-password",
  requireTrustedOrigin,
  resetPasswordRateLimiter,
  completePasswordReset,
);

export default router;