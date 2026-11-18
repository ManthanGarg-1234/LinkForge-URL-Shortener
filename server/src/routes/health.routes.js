
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Liveness: confirms that the Node.js process is running.
router.get("/live", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LinkForge API is alive.",
    data: {
      service: "LinkForge API",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

// Readiness: confirms that the application can access PostgreSQL.
router.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "LinkForge API is ready.",
      data: {
        api: "operational",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Readiness check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "LinkForge API is not ready.",
      data: {
        api: "operational",
        database: "unavailable",
      },
    });
  }
});

// Preserve the existing health endpoint as a readiness check.
router.get("/", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "LinkForge API is operational.",
      data: {
        service: "LinkForge API",
        database: "connected",
        environment: process.env.NODE_ENV || "development",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "LinkForge API is unavailable.",
      data: {
        database: "disconnected",
      },
    });
  }
});

export default router;
