import { Router } from "express";

import { submitAbuseReport } from "../controllers/abuse-report.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { abuseReportRateLimiter } from "../middleware/url-rate-limit.middleware.js";
import { requireTrustedOrigin } from "../middleware/trusted-origin.middleware.js";

const router = Router();

// Abuse reports require a verified, active authenticated session.
router.post(
  "/",
  requireTrustedOrigin,
  authenticate,
  abuseReportRateLimiter,
  submitAbuseReport,
);

export default router;