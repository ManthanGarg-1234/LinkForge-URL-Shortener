
import { Router } from "express";

import {
  getDashboardOverview,
  listAdminUsers,
  getAdminUser,
  suspendUser,
  reactivateUser,
} from "../controllers/admin.controller.js";

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

export default router;
