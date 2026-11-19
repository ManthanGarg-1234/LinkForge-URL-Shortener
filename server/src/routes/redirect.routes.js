
import { Router } from "express";
import { redirectShortUrl } from "../controllers/url.controller.js";

const router = Router();

router.get("/:shortCode", redirectShortUrl);

export default router;
