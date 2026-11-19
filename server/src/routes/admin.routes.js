
import { Router } from "express";

import {
  getDashboardOverview,
  listAdminUsers,
  getAdminUser,
  suspendUser,
  reactivateUser,
} from "../controllers/admin.controller.js";

import {
  listAdminAbuseReports,
  getAdminAbuseReport,
  reviewAbuseReport,
} from "../controllers/admin-moderation.controller.js";

import {
  blockAdminShortUrl,
  restoreAdminShortUrl,
} from "../controllers/admin-url-moderation.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/authorization.middleware.js";

const router = Router();

// All admin endpoints require authentication and ADMIN authorization.
router.use(authenticate);
router.use(authorizeRoles("ADMIN"));

// Dashboard
router.get("/dashboard/overview", getDashboardOverview);

// User management
router.get("/users", listAdminUsers);
router.get("/users/:id", getAdminUser);
router.post("/users/:id/suspend", suspendUser);
router.post("/users/:id/reactivate", reactivateUser);

// Abuse report management
router.get("/abuse-reports", listAdminAbuseReports);
router.get("/abuse-reports/:id", getAdminAbuseReport);
router.post("/abuse-reports/:id/review", reviewAbuseReport);

// Short URL moderation
router.post("/short-urls/:shortCode/block", blockAdminShortUrl);
router.post("/short-urls/:shortCode/restore", restoreAdminShortUrl);

export default router;
