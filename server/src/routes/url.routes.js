import { Router } from "express";

import {
  createUrl,
  listUrls,
  updateUrl,
  updateUrlStatus,
  deleteUrl,
} from "../controllers/url.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { urlCreationRateLimiter } from "../middleware/url-rate-limit.middleware.js";
import { requireTrustedOrigin } from "../middleware/trusted-origin.middleware.js";

const router = Router();

router.post(
  "/",
  requireTrustedOrigin,
  authenticate,
  urlCreationRateLimiter,
  createUrl,
);

router.get("/", authenticate, listUrls);

// Update destination URL and/or expiration date.
router.patch("/:id", requireTrustedOrigin, authenticate, updateUrl);

// Activate or deactivate a short URL.
router.patch(
  "/:id/status",
  requireTrustedOrigin,
  authenticate,
  updateUrlStatus,
);

router.delete("/:id", requireTrustedOrigin, authenticate, deleteUrl);

export default router;
