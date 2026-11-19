
import { Router } from "express";

import {
  getOverview,
  getLinkDetails,
} from "../controllers/analytics.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/overview", getOverview);
router.get("/links/:id", getLinkDetails);

export default router;
